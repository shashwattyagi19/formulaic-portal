-- Formulaic Portal — database schema
-- Run in Supabase SQL editor before policies.sql and seed.sql

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum (
  'managing_director', 'branch_head', 'technical_manager',
  'site_engineer', 'drafter', 'operator'
);

create type public.attendance_status as enum (
  'present', 'absent', 'half_day', 'on_leave', 'late'
);

create type public.expense_status as enum (
  'pending', 'approved', 'rejected', 'reimbursed'
);

create type public.visit_status as enum (
  'assigned', 'en_route', 'on_site', 'completed', 'cancelled'
);

create type public.property_type as enum (
  'residential', 'commercial', 'industrial', 'land'
);

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create table public.branches (
  id            text primary key,
  name          text not null,
  code          text not null,
  city          text not null,
  state         text not null,
  address       text,
  lat           double precision,
  lng           double precision,
  monthly_budget numeric not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (linked to auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  role        public.user_role not null default 'operator',
  branch_id   text references public.branches (id),
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'operator'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- GPS history + live snapshot
-- ---------------------------------------------------------------------------
create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  heading    double precision default 0,
  speed      double precision default 0,
  battery    integer,
  recorded_at timestamptz not null default now()
);

create index locations_user_recorded on public.locations (user_id, recorded_at desc);

create table public.live_positions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  heading     double precision default 0,
  speed       double precision default 0,
  battery     integer,
  updated_at  timestamptz not null default now()
);

create or replace function public.sync_live_position()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.live_positions (user_id, lat, lng, heading, speed, battery, updated_at)
  values (new.user_id, new.lat, new.lng, new.heading, new.speed, new.battery, new.recorded_at)
  on conflict (user_id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    heading = excluded.heading,
    speed = excluded.speed,
    battery = excluded.battery,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger locations_sync_live
  after insert on public.locations
  for each row execute function public.sync_live_position();

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  work_date     date not null,
  check_in      timestamptz,
  check_out     timestamptz,
  check_in_lat  double precision,
  check_in_lng  double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  status        public.attendance_status not null default 'present',
  unique (user_id, work_date)
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  branch_id   text not null references public.branches (id),
  user_id     uuid references public.profiles (id),
  category    text not null,
  description text,
  amount      numeric not null,
  spent_on    date not null,
  status      public.expense_status not null default 'pending',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Site visits (valuation jobs)
-- ---------------------------------------------------------------------------
create table public.site_visits (
  id               uuid primary key default gen_random_uuid(),
  branch_id        text not null references public.branches (id),
  engineer_id      uuid references public.profiles (id),
  client_name      text not null,
  property_type    public.property_type not null default 'residential',
  address          text,
  lat              double precision,
  lng              double precision,
  status           public.visit_status not null default 'assigned',
  scheduled_at     timestamptz not null,
  completed_at     timestamptz,
  estimated_value  numeric,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.live_positions;
