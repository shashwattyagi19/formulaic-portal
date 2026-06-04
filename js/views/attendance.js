import { h, fmtTime, todayISO } from '../util.js';
import { statusBadge } from '../ui.js';
import { Data } from '../data.js';
import * as Mock from '../mock.js';
import { isField } from '../roles.js';

export async function renderAttendance(profile) {
  const opts = isField(profile) ? { userId: profile.id } : {};
  const rows = await Data.getAttendance(opts);

  const tbody = h('tbody');
  rows.slice(0, 40).forEach((a) => {
    const tr = h('tr',
      h('td', { className: 'bold' }, Mock.nameByUserId(a.user_id)),
      h('td', {}, a.work_date),
      h('td', {}, fmtTime(a.check_in)),
      h('td', {}, fmtTime(a.check_out)),
    );
    tr.appendChild(h('td', { html: statusBadge(a.status) }));
    tbody.appendChild(tr);
  });

  const present = rows.filter((r) => r.status === 'present').length;
  const late = rows.filter((r) => r.status === 'late').length;

  const root = h('div', {},
    h('div', { className: 'grid cols-3 mb-2' },
      h('div', { className: 'stat' }, h('span', { className: 'label' }, 'Records'), h('div', { className: 'value' }, String(rows.length))),
      h('div', { className: 'stat' }, h('span', { className: 'label' }, 'Present'), h('div', { className: 'value' }, String(present))),
      h('div', { className: 'stat' }, h('span', { className: 'label' }, 'Late'), h('div', { className: 'value' }, String(late))),
    ),
  );

  if (isField(profile)) {
    const todayRow = rows.find((r) => r.work_date === todayISO() && r.user_id === profile.id);
    if (!todayRow?.check_in) {
      const checkInBtn = h('button', { type: 'button', className: 'btn btn-primary mb-2' }, 'Check in now');
      checkInBtn.addEventListener('click', async () => {
        await Data.checkIn(profile.id, { lat: 19.076, lng: 72.8777 });
        document.getElementById('view-root').innerHTML = '';
        document.getElementById('view-root').appendChild(await renderAttendance(profile));
      });
      root.appendChild(checkInBtn);
    } else if (!todayRow?.check_out) {
      const outBtn = h('button', { type: 'button', className: 'btn btn-ghost mb-2' }, 'Check out');
      outBtn.addEventListener('click', async () => {
        await Data.checkOut(profile.id, { lat: 19.076, lng: 72.8777 });
        document.getElementById('view-root').innerHTML = '';
        document.getElementById('view-root').appendChild(await renderAttendance(profile));
      });
      root.appendChild(outBtn);
    }
  }

  root.appendChild(h('div', { className: 'card' },
    h('div', { className: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          ...['Employee', 'Date', 'Check in', 'Check out', 'Status'].map((h) => h('th', {}, h)),
        )),
        tbody,
      ),
    ),
  ));

  return root;
}
