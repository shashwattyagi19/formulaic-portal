-- ============================================================================
--  Formulaic Portal — Seed data
--  Run AFTER schema.sql + policies.sql.
--
--  NOTE: `profiles` rows are created automatically by the on_auth_user_created
--  trigger when you add users in Supabase Auth. This seed therefore only
--  populates branches and a few unassigned demo site-visits. Once you have
--  created users, update their profile role/branch with the UPDATE examples
--  at the bottom, then re-run the sample-data block.
-- ============================================================================

-- Branches -------------------------------------------------------------------
insert into public.branches (id, name, code, address, city, state, lat, lng, monthly_budget)
values
  ('11111111-1111-1111-1111-111111111111', 'Mumbai HQ',   'MUM', 'Bandra Kurla Complex',        'Mumbai',    'Maharashtra', 19.0670, 72.8700, 1200000),
  ('22222222-2222-2222-2222-222222222222', 'Pune Branch', 'PUN', 'Hinjewadi Phase 2',           'Pune',      'Maharashtra', 18.5913, 73.7389,  800000),
  ('33333333-3333-3333-3333-333333333333', 'Delhi Branch','DEL', 'Connaught Place',             'New Delhi', 'Delhi',       28.6315, 77.2167,  950000)
on conflict (id) do nothing;

-- Unassigned demo valuation jobs --------------------------------------------
insert into public.site_visits (branch_id, client_name, property_type, address, lat, lng, status, scheduled_at, estimated_value)
values
  ('11111111-1111-1111-1111-111111111111', 'HDFC Bank',     'commercial',  'Lower Parel, Mumbai',    18.9967, 72.8300, 'assigned', now() + interval '1 day', 45000000),
  ('11111111-1111-1111-1111-111111111111', 'Patel Estates', 'residential', 'Andheri West, Mumbai',   19.1360, 72.8260, 'assigned', now() + interval '2 day', 12000000),
  ('22222222-2222-2222-2222-222222222222', 'Kohinoor Group','industrial',  'Chakan MIDC, Pune',      18.7600, 73.8400, 'assigned', now() + interval '1 day', 78000000)
on conflict do nothing;

-- ----------------------------------------------------------------------------
--  After creating Auth users, link them to branches & roles, e.g.:
--
--    update public.profiles set role = 'managing_director'
--      where email = 'md@formulaic.example';
--
--    update public.profiles set role = 'branch_head',
--      branch_id = '11111111-1111-1111-1111-111111111111'
--      where email = 'head.mumbai@formulaic.example';
--
--    update public.profiles set role = 'site_engineer',
--      branch_id = '11111111-1111-1111-1111-111111111111'
--      where email = 'engineer1@formulaic.example';
-- ----------------------------------------------------------------------------
