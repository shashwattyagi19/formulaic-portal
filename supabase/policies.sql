-- Formulaic Portal — Row Level Security
-- Run after schema.sql

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.live_positions enable row level security;
alter table public.attendance enable row level security;
alter table public.expenses enable row level security;
alter table public.site_visits enable row level security;

-- Helper: current user's profile row
create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.is_md()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'managing_director');
$$;

create or replace function public.my_branch_id()
returns text language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid();
$$;

-- Branches: everyone authenticated can read; MD can manage
create policy "branches_read" on public.branches for select to authenticated using (true);
create policy "branches_write_md" on public.branches for all to authenticated
  using (public.is_md()) with check (public.is_md());

-- Profiles: read own + same branch + MD sees all
create policy "profiles_read" on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_md()
  or branch_id = public.my_branch_id()
);
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Locations: engineers insert own; managers read branch engineers
create policy "locations_insert_self" on public.locations for insert to authenticated
  with check (user_id = auth.uid());
create policy "locations_read" on public.locations for select to authenticated using (
  user_id = auth.uid()
  or public.is_md()
  or exists (
    select 1 from public.profiles p
    where p.id = locations.user_id and p.branch_id = public.my_branch_id()
  )
);

-- Live positions: same read scope as locations
create policy "live_positions_read" on public.live_positions for select to authenticated using (
  user_id = auth.uid()
  or public.is_md()
  or exists (
    select 1 from public.profiles p
    where p.id = live_positions.user_id and p.branch_id = public.my_branch_id()
  )
);

-- Attendance
create policy "attendance_read" on public.attendance for select to authenticated using (
  user_id = auth.uid()
  or public.is_md()
  or exists (select 1 from public.profiles p where p.id = attendance.user_id and p.branch_id = public.my_branch_id())
);
create policy "attendance_write_self" on public.attendance for insert to authenticated
  with check (user_id = auth.uid());
create policy "attendance_update_self" on public.attendance for update to authenticated
  using (user_id = auth.uid());

-- Expenses: branch-scoped; operators+ can insert for their branch
create policy "expenses_read" on public.expenses for select to authenticated using (
  public.is_md() or branch_id = public.my_branch_id()
);
create policy "expenses_insert" on public.expenses for insert to authenticated with check (
  public.is_md() or branch_id = public.my_branch_id()
);
create policy "expenses_update_managers" on public.expenses for update to authenticated using (
  public.is_md()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('branch_head', 'technical_manager') and p.branch_id = expenses.branch_id
  )
);

-- Site visits
create policy "visits_read" on public.site_visits for select to authenticated using (
  public.is_md()
  or branch_id = public.my_branch_id()
  or engineer_id = auth.uid()
);
create policy "visits_write_managers" on public.site_visits for all to authenticated using (
  public.is_md()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('branch_head', 'technical_manager') and p.branch_id = site_visits.branch_id
  )
) with check (
  public.is_md()
  or branch_id = public.my_branch_id()
);
create policy "visits_update_engineer" on public.site_visits for update to authenticated
  using (engineer_id = auth.uid());
