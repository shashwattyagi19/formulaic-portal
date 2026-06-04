import { h, fmtDate } from '../util.js';
import { statusBadge } from '../ui.js';
import { Data } from '../data.js';
import * as Mock from '../mock.js';
import { isField, isAdmin } from '../roles.js';

export async function renderVisits(profile) {
  const branchFilter = isAdmin(profile) ? {} : { branchId: profile.branch_id };
  const opts = isField(profile) ? { engineerId: profile.id } : branchFilter;
  const rows = await Data.getSiteVisits(opts);

  const tbody = h('tbody');
  rows.forEach((v) => {
    const tr = h('tr',
      h('td', { className: 'bold' }, v.client_name),
      h('td', {}, Mock.nameByUserId(v.engineer_id)),
      h('td', {}, v.property_type || '—'),
      h('td', { className: 'muted text-sm' }, v.address || '—'),
      h('td', { className: 'faint' }, fmtDate(v.scheduled_at)),
    );
    tr.appendChild(h('td', { html: statusBadge(v.status) }));
    if (v.estimated_value) {
      tr.appendChild(h('td', { className: 'right nowrap' }, `₹${(v.estimated_value / 1e7).toFixed(1)} Cr`));
    } else {
      tr.appendChild(h('td', {}, '—'));
    }
    tbody.appendChild(tr);
  });

  return h('div', {},
    h('div', { className: 'toolbar' },
      h('div', { className: 'search' }, h('span', {}, '🔍'), (() => {
        const inp = h('input', { type: 'search', placeholder: 'Search visits…' });
        inp.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          tbody.querySelectorAll('tr').forEach((tr) => {
            tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
          });
        });
        return inp;
      })()),
    ),
    h('div', { className: 'card' },
      h('div', { className: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {},
            ...['Client', 'Engineer', 'Type', 'Address', 'Scheduled', 'Status', 'Est. value'].map((h) => h('th', {}, h)),
          )),
          tbody,
        ),
      ),
    ),
  );
}
