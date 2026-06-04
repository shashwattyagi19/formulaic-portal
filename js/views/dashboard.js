import { h, el, profileName, todayISO, fmtDate } from '../util.js';
import { statCard, statusBadge, barChart } from '../ui.js';
import { Data } from '../data.js';
import * as Mock from '../mock.js';
import { isField, isAdmin, canAccess, roleColor } from '../roles.js';

const OPEN_VISIT = ['on_site', 'en_route', 'assigned'];

export async function renderDashboard(profile) {
  const branchFilter = isAdmin(profile) ? {} : { branchId: profile.branch_id };
  const visitFilter = isField(profile) ? { engineerId: profile.id } : branchFilter;

  const [attendance, expenses, visits, positions, activity, weekly] = await Promise.all([
    Data.getAttendance({ date: todayISO(), ...(isField(profile) ? { userId: profile.id } : {}) }),
    Data.getExpenses(canAccess('expenses', profile.role) ? branchFilter : { branchId: profile.branch_id }),
    Data.getSiteVisits(visitFilter),
    Data.getLivePositions(),
    Data.getActivity(),
    Data.getWeeklyVisitCounts(),
  ]);

  const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
  const pendingExp = expenses.filter((e) => e.status === 'pending').length;
  const activeVisits = visits.filter((v) => OPEN_VISIT.includes(v.status)).length;
  const live = Object.keys(positions).length;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const accent = roleColor('site_engineer');

  const stats = h('div', { className: 'grid cols-4 mb-2' },
    el(statCard({ label: 'Present today', value: present, sub: 'Attendance today', deltaDir: 'up', iconName: 'clock', accent })),
    el(statCard({ label: 'Engineers on map', value: live, sub: 'Live GPS pings', deltaDir: 'up', iconName: 'map', accent: '#0891b2' })),
    el(statCard({ label: 'Open visits', value: activeVisits, sub: 'Assigned & active', deltaDir: 'up', iconName: 'briefcase', accent: '#d97706' })),
    el(statCard({ label: 'Pending expenses', value: pendingExp, sub: 'Awaiting approval', deltaDir: pendingExp ? 'down' : 'up', iconName: 'wallet', accent: '#7c3aed' })),
  );

  const chartData = days.map((label, i) => ({ label, value: weekly[i], display: weekly[i] }));
  const activityEl = h('div', { className: 'split-list' });
  activity.forEach((a) => {
    activityEl.appendChild(h('div', { className: 'split-row' },
      h('span', { className: 'faint nowrap' }, a.time),
      h('span', { className: 'text-sm', style: 'flex:1' }, a.text),
    ));
  });

  const tbody = h('tbody');
  visits.slice(0, 5).forEach((v) => {
    const tr = h('tr',
      h('td', { className: 'bold' }, v.client_name),
      h('td', {}, Mock.nameByUserId(v.engineer_id)),
      h('td', { className: 'muted text-sm' }, v.property_type || '—'),
      h('td', { html: statusBadge(v.status) }),
      h('td', { className: 'faint' }, fmtDate(v.scheduled_at)),
    );
    tbody.appendChild(tr);
  });

  const grid = h('div', { className: 'grid cols-2' },
    h('div', { className: 'card span-2' },
      h('div', { className: 'card-head' }, h('h3', {}, 'Site visits (last 7 days)')),
      h('div', { className: 'card-pad' }, el(barChart(chartData, { accent: `linear-gradient(${accent}, #6ea0ff)` }))),
    ),
    h('div', { className: 'card' },
      h('div', { className: 'card-head' }, h('h3', {}, 'Live activity')),
      h('div', { className: 'card-pad' }, activityEl),
    ),
    h('div', { className: 'card' },
      h('div', { className: 'card-head' },
        h('h3', {}, 'Upcoming visits'),
        h('a', { href: '#/visits', className: 'text-sm' }, 'View all'),
      ),
      h('div', { className: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {},
            ...['Client', 'Engineer', 'Type', 'Status', 'Scheduled'].map((label) => h('th', {}, label)),
          )),
          tbody,
        ),
      ),
    ),
  );

  const root = h('div', {}, stats, grid);
  if (isField(profile)) {
    root.prepend(h('p', { className: 'muted text-sm mb-2' }, `Hello ${profileName(profile)} — your route and visits are updating live.`));
  }
  return root;
}
