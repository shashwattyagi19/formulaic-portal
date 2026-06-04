-- Formulaic Portal — seed branches and sample valuation jobs
-- Run after schema.sql and policies.sql

insert into public.branches (id, name, code, city, state, address, lat, lng, monthly_budget) values
  ('b-mum', 'Mumbai HQ',    'MUM', 'Mumbai',    'Maharashtra', 'Bandra Kurla Complex', 19.0670, 72.8700, 1200000),
  ('b-pun', 'Pune Branch',  'PUN', 'Pune',      'Maharashtra', 'Hinjewadi Phase 2',   18.5913, 73.7389,  800000),
  ('b-del', 'Delhi Branch', 'DEL', 'New Delhi', 'Delhi',       'Connaught Place',     28.6315, 77.2167,  950000)
on conflict (id) do nothing;

-- Sample jobs (assign engineer_id after you create auth users and set profiles)
insert into public.site_visits (
  branch_id, engineer_id, client_name, property_type, address, lat, lng,
  status, scheduled_at, estimated_value
) values
  ('b-mum', null, 'HDFC Bank',        'commercial',  'Lower Parel, Mumbai',  18.9967, 72.8300, 'assigned', now(), 45000000),
  ('b-mum', null, 'Patel Estates',    'residential', 'Andheri West, Mumbai', 19.1360, 72.8260, 'assigned', now(), 12000000),
  ('b-pun', null, 'Kohinoor Group',   'industrial',  'Chakan MIDC, Pune',    18.7600, 73.8400, 'assigned', now(), 78000000),
  ('b-mum', null, 'Axis Bank',        'commercial',  'BKC, Mumbai',          19.0670, 72.8700, 'completed', now() - interval '1 day', 33000000);

-- ---------------------------------------------------------------------------
-- After creating users in Authentication → Users, set roles, e.g.:
--
-- update public.profiles set role = 'managing_director', branch_id = null
--   where email = 'md@formulaic.in';
--
-- update public.profiles set role = 'branch_head', branch_id = 'b-mum'
--   where email = 'head.mumbai@formulaic.in';
--
-- update public.profiles set role = 'technical_manager', branch_id = 'b-mum'
--   where email = 'tech@formulaic.in';
--
-- update public.profiles set role = 'site_engineer', branch_id = 'b-mum'
--   where email = 'imran@formulaic.in';
--
-- update public.profiles set role = 'drafter', branch_id = 'b-mum'
--   where email = 'drafter@formulaic.in';
--
-- update public.profiles set role = 'operator', branch_id = 'b-mum'
--   where email = 'operator@formulaic.in';
-- ---------------------------------------------------------------------------
