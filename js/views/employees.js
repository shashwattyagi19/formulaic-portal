import { h, profileInitials, profileName, colorFor } from '../util.js';
import { statusBadge } from '../ui.js';
import { Data } from '../data.js';
import { roleLabel, roleColor } from '../roles.js';
import * as Mock from '../mock.js';

export async function renderEmployees() {
  const [profiles, positions, branches] = await Promise.all([
    Data.getProfiles(),
    Data.getLivePositions(),
    Data.getBranches(),
  ]);

  const branchName = (id) => branches.find((b) => b.id === id)?.name || '—';

  const tbody = h('tbody');
  profiles.forEach((p) => {
    const live = positions[p.id];
    const visitSt = live ? Mock.db().site_visits.find((v) => v.engineer_id === p.id && v.status === 'on_site') : null;
    const st = visitSt ? 'on_site' : live ? 'en_route' : p.role === 'site_engineer' ? 'assigned' : 'completed';

    const tr = h('tr',
      h('td',
        h('div', { className: 'flex' },
          h('span', { className: 'avatar sm', style: `background:${colorFor(p.full_name)}` }, profileInitials(p)),
          h('b', {}, profileName(p)),
        ),
      ),
      h('td', {}, h('span', {
        className: `role-tag ${p.role}`,
        style: `background:${roleColor(p.role)}22;color:${roleColor(p.role)}`,
      }, roleLabel(p.role))),
      h('td', { className: 'muted' }, branchName(p.branch_id)),
      h('td', {}, p.email),
    );
    tr.appendChild(h('td', { html: statusBadge(p.role === 'site_engineer' ? st : 'assigned') }));
    tbody.appendChild(tr);
  });

  const engineers = profiles.filter((p) => p.role === 'site_engineer').length;

  return h('div', {},
    h('div', { className: 'grid cols-3 mb-2' },
      h('div', { className: 'stat' }, h('span', { className: 'label' }, 'Headcount'), h('div', { className: 'value' }, String(profiles.length))),
      h('div', { className: 'stat' }, h('span', { className: 'label' }, 'Site engineers'), h('div', { className: 'value' }, String(engineers))),
      h('div', { className: 'stat' }, h('span', { className: 'label' }, 'Branches'), h('div', { className: 'value' }, String(branches.length))),
    ),
    h('div', { className: 'card' },
      h('div', { className: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {},
            ...['Name', 'Role', 'Branch', 'Email', 'Status'].map((h) => h('th', {}, h)),
          )),
          tbody,
        ),
      ),
    ),
  );
}
