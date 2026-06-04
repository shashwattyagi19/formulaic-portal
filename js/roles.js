// ============================================================================
//  Role metadata & permissions
// ============================================================================

export const ROLES = {
  managing_director: { label: 'Managing Director', short: 'MD',  color: '#7c3aed', tagClass: 'role-tag', admin: true },
  branch_head:       { label: 'Branch Head',       short: 'BH',  color: '#2563eb', manager: true },
  technical_manager: { label: 'Technical Manager', short: 'TM',  color: '#0891b2', manager: true },
  site_engineer:     { label: 'Site Engineer',     short: 'SE',  color: '#16a34a', field: true },
  drafter:           { label: 'Drafter',           short: 'DR',  color: '#d97706' },
  operator:          { label: 'Operator',          short: 'OP',  color: '#db2777' },
};

export const roleLabel = (r) => ROLES[r]?.label || r;
export const roleColor = (r) => ROLES[r]?.color || '#64748b';
export const isAdmin   = (p) => p?.role === 'managing_director';
export const isManager = (p) => ['managing_director', 'branch_head', 'technical_manager'].includes(p?.role);
export const isField   = (p) => p?.role === 'site_engineer';

export const NAV = [
  { id: 'dashboard',  label: 'Dashboard',       icon: 'dashboard', roles: '*' },
  { id: 'tracking',   label: 'Live Field Map',  icon: 'map',       roles: '*' },
  { id: 'visits',     label: 'Site Visits',     icon: 'briefcase', roles: '*' },
  { id: 'attendance', label: 'Attendance',      icon: 'clock',     roles: '*' },
  { id: 'expenses',   label: 'Expenses',        icon: 'wallet',    roles: ['managing_director', 'branch_head', 'technical_manager', 'operator'] },
  { id: 'employees',  label: 'Employees',       icon: 'users',     roles: ['managing_director', 'branch_head', 'technical_manager'] },
  { id: 'profile',    label: 'My Profile',      icon: 'user',      roles: '*' },
];

export const canAccess = (routeId, role) => {
  const item = NAV.find((n) => n.id === routeId);
  if (!item) return false;
  return item.roles === '*' || item.roles.includes(role);
};

export const STATUS_BADGE = {
  present: 'green', absent: 'red', half_day: 'amber', on_leave: 'blue', late: 'amber',
  pending: 'amber', approved: 'green', rejected: 'red', reimbursed: 'blue',
  assigned: 'gray', en_route: 'amber', on_site: 'cyan', completed: 'green', cancelled: 'red',
};

export const labelize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** First accessible route (excludes profile — linked from sidebar footer). */
export function defaultRoute(role) {
  for (const item of NAV) {
    if (item.id === 'profile') continue;
    if (canAccess(item.id, role)) return item.id;
  }
  return 'dashboard';
}
