// ============================================================================
//  Attendance — check-in/out + records (role-aware)
// ============================================================================
import { el, esc, icon, todayISO, fmtTime, initials, colorFor, toast } from '../util.js';
import { Data } from '../data.js';
import { isManager, isAdmin, roleLabel } from '../roles.js';
import { statusBadge, statCard, emptyState } from '../ui.js';

export async function renderAttendance(profile) {
  const root = el('<div></div>');
  await paint(root, profile, todayISO());
  return root;
}

async function getCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null), { timeout: 6000 });
  });
}

async function paint(root, profile, date) {
  const [profiles, records] = await Promise.all([
    Data.getProfiles(), Data.getAttendance({ date }),
  ]);
  const scope = isAdmin(profile) ? profiles : profiles.filter((p) => p.branch_id === profile.branch_id);
  const myRec = records.find((r) => r.user_id === profile.id);

  const present = records.filter((r) => scope.some((p) => p.id === r.user_id) && r.status === 'present').length;
  const late = records.filter((r) => scope.some((p) => p.id === r.user_id) && r.status === 'late').length;
  const leave = records.filter((r) => scope.some((p) => p.id === r.user_id) && r.status === 'on_leave').length;
  const absent = scope.length - records.filter((r) => scope.some((p) => p.id === r.user_id) && r.check_in).length;

  // Self check-in / out card (everyone).
  const selfCard = `
    <div class="card mb-2">
      <div class="card-pad flex between wrap">
        <div class="flex">
          <div class="avatar lg" style="background:${colorFor(profile.full_name)}">${initials(profile.full_name)}</div>
          <div>
            <h3 style="font-size:17px">${esc(profile.full_name)}</h3>
            <span class="muted text-sm">${date === todayISO() ? 'Today' : date} · ${myRec?.check_in ? 'Checked in ' + fmtTime(myRec.check_in) : 'Not checked in'}${myRec?.check_out ? ' · out ' + fmtTime(myRec.check_out) : ''}</span>
          </div>
        </div>
        <div class="flex">
          ${date === todayISO() ? (
            !myRec?.check_in
              ? `<button class="btn btn-success lg" id="checkin">${icon('clock', 18)} Check in</button>`
              : !myRec?.check_out
                ? `<button class="btn btn-danger lg" id="checkout">${icon('clock', 18)} Check out</button>`
                : `<span class="badge green"><span class="dot"></span> Day complete</span>`
          ) : ''}
        </div>
      </div>
    </div>`;

  const managerStats = isManager(profile) ? `
    <div class="grid cols-4 mb-2">
      ${statCard({ label: 'Present', value: present, iconName: 'check', accent: '#16a34a' })}
      ${statCard({ label: 'Late', value: late, iconName: 'clock', accent: '#d97706' })}
      ${statCard({ label: 'On leave', value: leave, iconName: 'calendar', accent: '#2563eb' })}
      ${statCard({ label: 'Absent', value: Math.max(0, absent), iconName: 'alert', accent: '#dc2626' })}
    </div>` : '';

  const tableRows = scope.map((p) => {
    const r = records.find((x) => x.user_id === p.id);
    const status = r ? r.status : 'absent';
    return `<tr>
      <td><div class="flex"><div class="avatar sm" style="background:${colorFor(p.full_name)}">${initials(p.full_name)}</div><div><b>${esc(p.full_name)}</b><br><span class="faint text-sm">${esc(roleLabel(p.role))}</span></div></div></td>
      <td>${r?.check_in ? fmtTime(r.check_in) : '—'}</td>
      <td>${r?.check_out ? fmtTime(r.check_out) : '—'}</td>
      <td class="right">${statusBadge(status)}</td>
    </tr>`;
  }).join('');

  root.innerHTML = `
    <div class="toolbar">
      <div class="field" style="margin:0">
        <input class="input" type="date" id="date-pick" value="${date}" max="${todayISO()}" />
      </div>
      <div class="spacer"></div>
    </div>
    ${selfCard}
    ${managerStats}
    ${isManager(profile) ? `
      <div class="card">
        <div class="card-head"><h3>Team attendance · ${date === todayISO() ? 'Today' : date}</h3><div class="spacer"></div><span class="badge gray">${scope.length} people</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Check in</th><th>Check out</th><th class="right">Status</th></tr></thead>
            <tbody>${tableRows || ''}</tbody>
          </table>
          ${scope.length ? '' : emptyState('No employees in scope.', 'users')}
        </div>
      </div>` : await myHistory(profile)}
  `;

  root.querySelector('#date-pick').addEventListener('change', (e) => paint(root, profile, e.target.value));
  root.querySelector('#checkin')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    await Data.checkIn(profile.id, await getCoords());
    toast('Checked in. Have a productive day!', 'success');
    paint(root, profile, date);
  });
  root.querySelector('#checkout')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    await Data.checkOut(profile.id, await getCoords());
    toast('Checked out. See you tomorrow!', 'success');
    paint(root, profile, date);
  });
}

async function myHistory(profile) {
  const rows = (await Data.getAttendance({ userId: profile.id })).slice(0, 30);
  return `
    <div class="card">
      <div class="card-head"><h3>My attendance history</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th class="right">Status</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td>${new Date(r.work_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
            <td>${r.check_in ? fmtTime(r.check_in) : '—'}</td>
            <td>${r.check_out ? fmtTime(r.check_out) : '—'}</td>
            <td class="right">${statusBadge(r.status)}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${rows.length ? '' : emptyState('No attendance recorded yet.', 'clock')}
      </div>
    </div>`;
}
