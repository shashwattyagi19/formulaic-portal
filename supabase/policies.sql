-- ============================================================================
--  Formulaic Portal — Row Level Security policies
--  Run AFTER schema.sql.
--
--  Access model
--  ------------
--  * managing_director  -> full access to everything (the admin)
--  * branch_head        -> full access scoped to their own branch
--  * technical_manager  -> read across their branch, approve expenses/visits
--  * everyone else      -> read company data, write only their own rows
-- ============================================================================

-- Helper functions -----------------------------------------------------------
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_branch()
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'managing_director', false);
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in
    ('managing_director', 'branch_head', 'technical_manager'), false);
$$;

-- Enable RLS -----------------------------------------------------------------
alter table public.branches       enable row level security;
alter table public.profiles       enable row level security;
alter table public.locations      enable row level security;
alter table public.live_positions enable row level security;
alter table public.attendance     enable row level security;
alter table public.expenses       enable row level security;
alter table public.site_visits    enable row level security;

-- Branches -------------------------------------------------------------------
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches
  for select using (auth.uid() is not null);

drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches
  for all using (public.is_admin()) with check (public.is_admin());

-- Profiles -------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Locations ------------------------------------------------------------------
drop policy if exists locations_insert_self on public.locations;
create policy locations_insert_self on public.locations
  for insert with check (user_id = auth.uid());

drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations
  for select using (user_id = auth.uid() or public.is_manager());

-- Live positions -------------------------------------------------------------
drop policy if exists live_positions_read on public.live_positions;
create policy live_positions_read on public.live_positions
  for select using (user_id = auth.uid() or public.is_manager());

-- Attendance -----------------------------------------------------------------
drop policy if exists attendance_self on public.attendance;
create policy attendance_self on public.attendance
  for all using (user_id = auth.uid() or public.is_manager())
  with check (user_id = auth.uid() or public.is_manager());

-- Expenses -------------------------------------------------------------------
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.is_manager() and branch_id = public.current_branch())
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (auth.uid() is not null);

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (
    public.is_admin()
    or (public.is_manager() and branch_id = public.current_branch())
  );

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (public.is_admin());

-- Site visits ----------------------------------------------------------------
drop policy if exists visits_read on public.site_visits;
create policy visits_read on public.site_visits
  for select using (auth.uid() is not null);

drop policy if exists visits_write on public.site_visits;
create policy visits_write on public.site_visits
  for all using (
    engineer_id = auth.uid()
    or public.is_manager()
  ) with check (
    engineer_id = auth.uid()
    or public.is_manager()
  );
