-- ============================================================================
--  Formulaic Portal — Valuation Company Database Schema
--  Target: Supabase (PostgreSQL 15+)
--
--  Run this file in the Supabase SQL Editor (or via `supabase db push`) to
--  create all tables, types, indexes, triggers and the realtime publication
--  used by the portal. Run policies.sql afterwards to enable Row Level
--  Security, then seed.sql for demo data.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
--  Enumerated types
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum (
      'managing_director', -- super admin / company owner
      'branch_head',       -- runs a single branch
      'technical_manager', -- reviews & approves valuations
      'site_engineer',     -- field staff, location tracked
      'drafter',           -- prepares drawings / reports
      'operator'           -- data entry / back office
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type attendance_status as enum ('present', 'absent', 'half_day', 'on_leave', 'late');
  end if;

  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type expense_status as enum ('pending', 'approved', 'rejected', 'reimbursed');
  end if;

  if not exists (select 1 from pg_type where typname = 'visit_status') then
    create type visit_status as enum ('assigned', 'en_route', 'on_site', 'completed', 'cancelled');
  end if;
end$$;

-- ----------------------------------------------------------------------------
--  Branches
-- ----------------------------------------------------------------------------
create table if not exists public.branches (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  code        text unique,
  address     text,
  city        text,
  state       text,
  lat         double precision,
  lng         double precision,
  monthly_budget numeric(14,2) default 0,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  Profiles (extends Supabase auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  role        user_role not null default 'operator',
  branch_id   uuid references public.branches(id) on delete set null,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_profiles_branch on public.profiles(branch_id);
create index if not exists idx_profiles_role on public.profiles(role);

-- ----------------------------------------------------------------------------
--  Live location pings (Swiggy/Zomato style field tracking)
--  Each row is one GPS ping from a site engineer's device.
-- ----------------------------------------------------------------------------
create table if not exists public.locations (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    double precision,
  heading     double precision,
  speed       double precision,
  battery     int,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_locations_user_time on public.locations(user_id, recorded_at desc);

-- Convenience: latest known position per user (kept in sync by trigger below)
create table if not exists public.live_positions (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    double precision,
  heading     double precision,
  speed       double precision,
  battery     int,
  updated_at  timestamptz not null default now()
);

create or replace function public.sync_live_position()
returns trigger language plpgsql as $$
begin
  insert into public.live_positions as lp (user_id, lat, lng, accuracy, heading, speed, battery, updated_at)
  values (new.user_id, new.lat, new.lng, new.accuracy, new.heading, new.speed, new.battery, new.recorded_at)
  on conflict (user_id) do update
    set lat = excluded.lat,
        lng = excluded.lng,
        accuracy = excluded.accuracy,
        heading = excluded.heading,
        speed = excluded.speed,
        battery = excluded.battery,
        updated_at = excluded.updated_at;
  return new;
end$$;

drop trigger if exists trg_sync_live_position on public.locations;
create trigger trg_sync_live_position
  after insert on public.locations
  for each row execute function public.sync_live_position();

-- ----------------------------------------------------------------------------
--  Attendance
-- ----------------------------------------------------------------------------
create table if not exists public.attendance (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  work_date     date not null default current_date,
  check_in      timestamptz,
  check_out     timestamptz,
  check_in_lat  double precision,
  check_in_lng  double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  status        attendance_status not null default 'present',
  notes         text,
  created_at    timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists idx_attendance_date on public.attendance(work_date);
create index if not exists idx_attendance_user on public.attendance(user_id);

-- ----------------------------------------------------------------------------
--  Expenses / Expenditure (per branch)
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id           uuid primary key default uuid_generate_v4(),
  branch_id    uuid not null references public.branches(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  category     text not null,            -- travel, fuel, equipment, salary, rent, misc...
  description  text,
  amount       numeric(14,2) not null check (amount >= 0),
  spent_on     date not null default current_date,
  status       expense_status not null default 'pending',
  receipt_url  text,
  approved_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_expenses_branch on public.expenses(branch_id);
create index if not exists idx_expenses_date on public.expenses(spent_on);
create index if not exists idx_expenses_status on public.expenses(status);

-- ----------------------------------------------------------------------------
--  Site visits (valuation jobs assigned to site engineers)
-- ----------------------------------------------------------------------------
create table if not exists public.site_visits (
  id            uuid primary key default uuid_generate_v4(),
  branch_id     uuid references public.branches(id) on delete set null,
  engineer_id   uuid references public.profiles(id) on delete set null,
  client_name   text not null,
  property_type text,                    -- residential, commercial, industrial, land
  address       text,
  lat           double precision,
  lng           double precision,
  status        visit_status not null default 'assigned',
  scheduled_at  timestamptz,
  completed_at  timestamptz,
  estimated_value numeric(16,2),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_visits_engineer on public.site_visits(engineer_id);
create index if not exists idx_visits_status on public.site_visits(status);

-- ----------------------------------------------------------------------------
--  New-user hook: create a profile row automatically on signup
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'operator')
  )
  on conflict (id) do nothing;
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
--  Realtime: broadcast location & visit changes to subscribed clients
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.live_positions;
alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.site_visits;
alter publication supabase_realtime add table public.attendance;
