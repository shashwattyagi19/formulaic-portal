// ============================================================================
//  Employees — team directory
// ============================================================================
import { el, esc, icon, initials, colorFor } from '../util.js';
import { Data } from '../data.js';
import { isAdmin, ROLES, roleLabel, roleColor } from '../roles.js';
import { statCard, emptyState } from '../ui.js';

export async function renderEmployees(profile) {
  const [profiles, branches] = await Promise.all([Data.getProfiles(), Data.getBranches()]);
  const scope = isAdmin(profile) ? profiles : profiles.filter((p) => p.branch_id === profile.branch_id);

  const root = el('<div></div>');
  let roleFilter = 'all';
  let query = '';

  function paint() {
    const branchName = (id) => branches.find((b) => b.id === id)?.name || '—';
    let list = scope;
    if (roleFilter !== 'all') list = list.filter((p) => p.role === roleFilter);
    if (query) list = list.filter((p) => p.full_name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query));

    const byRole = {};
    scope.forEach((p) => { byRole[p.role] = (byRole[p.role] || 0) + 1; });

    root.innerHTML = `
      <div class="grid cols-4 mb-2">
        ${statCard({ label: 'Total team', value: scope.length, sub: `${branches.length} branches`, iconName: 'users', accent: '#2563eb' })}
        ${statCard({ label: 'Site engineers', value: byRole.site_engineer || 0, sub: 'field staff', iconName: 'map', accent: '#16a34a' })}
        ${statCard({ label: 'Managers', value: (byRole.branch_head || 0) + (byRole.technical_manager || 0), sub: 'leads & heads', iconName: 'briefcase', accent: '#7c3aed' })}
        ${statCard({ label: 'Back office', value: (byRole.drafter || 0) + (byRole.operator || 0), sub: 'drafters & operators', iconName: 'user', accent: '#d97706' })}
      </div>

      <div class="toolbar">
        <div class="search">${icon('search', 16)}<input id="emp-search" placeholder="Search by name or email…" value="${esc(query)}" /></div>
        <select class="input" id="role-filter" style="width:auto">
          <option value="all">All roles</option>
          ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${roleFilter === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <span class="badge gray">${list.length} shown</span>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              ${list.map((p) => `<tr>
                <td><div class="flex"><div class="avatar sm" style="background:${colorFor(p.full_name)}">${initials(p.full_name)}</div><div><b>${esc(p.full_name)}</b><br><span class="faint text-sm">${esc(p.email)}</span></div></div></td>
                <td><span class="role-tag" style="background:${roleColor(p.role)}1a;color:${roleColor(p.role)}">${esc(roleLabel(p.role))}</span></td>
                <td>${esc(branchName(p.branch_id))}</td>
                <td class="nowrap">${esc(p.phone || '—')}</td>
                <td>${p.is_active ? '<span class="badge green"><span class="dot"></span>Active</span>' : '<span class="badge gray">Inactive</span>'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          ${list.length ? '' : emptyState('No employees match your filters.', 'users')}
        </div>
      </div>
    `;

    root.querySelector('#emp-search').addEventListener('input', (e) => { query = e.target.value.toLowerCase(); paint(); root.querySelector('#emp-search').focus(); });
    root.querySelector('#role-filter').addEventListener('change', (e) => { roleFilter = e.target.value; paint(); });
  }

  paint();
  return root;
}
