// ============================================================================
//  Dashboard — role-aware operational overview
// ============================================================================
import { el, esc, icon, fmtMoney, fmtMoneyFull, todayISO, initials, colorFor, timeAgo } from '../util.js';
import { Data } from '../data.js';
import { isAdmin, isManager, isField, roleLabel, ROLES } from '../roles.js';
import { statCard, statusBadge, barChart, emptyState } from '../ui.js';

export async function renderDashboard(profile) {
  const [branches, profiles, expenses, visits, todayAtt, livePos] = await Promise.all([
    Data.getBranches(), Data.getProfiles(),
    Data.getExpenses(isAdmin(profile) ? {} : { branchId: profile.branch_id }),
    Data.getSiteVisits(isAdmin(profile) ? {} : { branchId: profile.branch_id }),
    Data.getAttendance({ date: todayISO() }),
    Data.getLivePositions(),
  ]);

  const scopeProfiles = isAdmin(profile) ? profiles : profiles.filter((p) => p.branch_id === profile.branch_id);
  const month = new Date().toISOString().slice(0, 7);
  const monthExp = expenses.filter((e) => e.spent_on?.startsWith(month));
  const spent = monthExp.reduce((s, e) => s + Number(e.amount), 0);
  const budget = isAdmin(profile)
    ? branches.reduce((s, b) => s + Number(b.monthly_budget || 0), 0)
    : Number(branches.find((b) => b.id === profile.branch_id)?.monthly_budget || 0);
  const pendingExp = expenses.filter((e) => e.status === 'pending');

  const presentToday = todayAtt.filter((a) => scopeProfiles.some((p) => p.id === a.user_id) && a.check_in);
  const fieldStaff = scopeProfiles.filter(isField);
  const onlineNow = fieldStaff.filter((p) => livePos[p.id] && Date.now() - new Date(livePos[p.id].updated_at).getTime() < 120000);
  const activeVisits = visits.filter((v) => ['en_route', 'on_site'].includes(v.status));
  const pipeline = visits.filter((v) => v.status !== 'cancelled').reduce((s, v) => s + Number(v.estimated_value || 0), 0);

  // Field engineers see a personalised view.
  if (isField(profile)) return renderFieldDashboard(profile, visits, todayAtt, livePos);

  const root = el(`<div></div>`);

  const stats = isAdmin(profile) ? `
    <div class="grid cols-4 mb-2">
      ${statCard({ label: 'Branches', value: branches.length, sub: `${profiles.length} employees`, iconName: 'building', accent: '#7c3aed' })}
      ${statCard({ label: 'Field staff online', value: `${onlineNow.length}/${fieldStaff.length}`, sub: `${activeVisits.length} active visits`, iconName: 'map', accent: '#16a34a', deltaDir: 'up' })}
      ${statCard({ label: 'Spend this month', value: fmtMoney(spent), sub: `of ${fmtMoney(budget)} budget`, iconName: 'wallet', accent: '#2563eb' })}
      ${statCard({ label: 'Valuation pipeline', value: fmtMoney(pipeline), sub: `${visits.length} jobs`, iconName: 'trend', accent: '#d97706', deltaDir: 'up' })}
    </div>` : `
    <div class="grid cols-4 mb-2">
      ${statCard({ label: 'Present today', value: `${presentToday.length}/${scopeProfiles.length}`, sub: 'team members', iconName: 'clock', accent: '#16a34a', deltaDir: 'up' })}
      ${statCard({ label: 'Field staff online', value: `${onlineNow.length}/${fieldStaff.length}`, sub: `${activeVisits.length} active visits`, iconName: 'map', accent: '#2563eb' })}
      ${statCard({ label: 'Spend this month', value: fmtMoney(spent), sub: `of ${fmtMoney(budget)} budget`, iconName: 'wallet', accent: '#d97706' })}
      ${statCard({ label: 'Pending approvals', value: pendingExp.length, sub: 'expense claims', iconName: 'alert', accent: '#dc2626' })}
    </div>`;

  // Expense-by-branch (admin) or expense-by-category (branch).
  let chartData, chartTitle;
  if (isAdmin(profile)) {
    chartTitle = 'Spend by branch · this month';
    chartData = branches.map((b) => ({
      label: b.code,
      value: monthExp.filter((e) => e.branch_id === b.id).reduce((s, e) => s + Number(e.amount), 0),
    }));
  } else {
    chartTitle = 'Spend by category · this month';
    const cats = {};
    monthExp.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + Number(e.amount); });
    chartData = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: k.slice(0, 6), value: v }));
  }

  const usedPct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  root.innerHTML = `
    ${stats}
    <div class="grid cols-3 mb-2">
      <div class="card span-2">
        <div class="card-head"><h3>${esc(chartTitle)}</h3></div>
        <div class="card-pad">
          ${chartData.length ? barChart(chartData) : emptyState('No spend recorded yet.', 'wallet')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Budget usage</h3></div>
        <div class="card-pad">
          <div class="value" style="font-size:26px;font-weight:800">${fmtMoneyFull(spent)}</div>
          <div class="muted text-sm">of ${fmtMoneyFull(budget)} this month</div>
          <div class="progress mt-2 ${usedPct >= 100 ? 'over' : ''}"><span style="width:${usedPct}%"></span></div>
          <div class="flex between mt-1 text-sm"><span class="muted">${usedPct}% used</span><span class="muted">${fmtMoney(Math.max(0, budget - spent))} left</span></div>
          <div class="mt-3 split-list">
            <div class="split-row"><span>${icon('alert', 16)}</span><span style="flex:1">Pending claims</span><b>${pendingExp.length}</b></div>
            <div class="split-row"><span>${icon('check', 16)}</span><span style="flex:1">Approved</span><b>${expenses.filter((e) => e.status === 'approved').length}</b></div>
            <div class="split-row"><span>${icon('wallet', 16)}</span><span style="flex:1">Reimbursed</span><b>${expenses.filter((e) => e.status === 'reimbursed').length}</b></div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h3>Active site visits</h3><div class="spacer"></div><a class="badge blue" href="#/visits">View all</a></div>
        <div class="table-wrap">
          ${activeVisits.length ? `<table><tbody>
            ${activeVisits.slice(0, 6).map((v) => {
              const eng = profiles.find((p) => p.id === v.engineer_id);
              return `<tr>
                <td><b>${esc(v.client_name)}</b><br><span class="faint text-sm">${esc(v.address || '')}</span></td>
                <td>${eng ? `<div class="flex"><div class="avatar sm" style="background:${colorFor(eng.full_name)}">${initials(eng.full_name)}</div><span class="text-sm">${esc(eng.full_name.split(' ')[0])}</span></div>` : '<span class="faint">Unassigned</span>'}</td>
                <td class="right">${statusBadge(v.status)}</td>
              </tr>`;
            }).join('')}
          </tbody></table>` : emptyState('No active visits right now.', 'briefcase')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Who's in today</h3><div class="spacer"></div><a class="badge blue" href="#/attendance">View all</a></div>
        <div class="card-pad" style="padding-top:6px">
          ${scopeProfiles.slice(0, 7).map((p) => {
            const a = todayAtt.find((x) => x.user_id === p.id);
            const status = a ? a.status : 'absent';
            return `<div class="split-row">
              <div class="avatar sm" style="background:${colorFor(p.full_name)}">${initials(p.full_name)}</div>
              <div style="flex:1"><b class="text-sm">${esc(p.full_name)}</b><br><span class="faint" style="font-size:11.5px">${esc(roleLabel(p.role))}</span></div>
              ${a?.check_in ? `<span class="faint text-sm">${new Date(a.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
              ${statusBadge(status)}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
  return root;
}

// --- Field engineer's personal dashboard ------------------------------------
async function renderFieldDashboard(profile, visits, todayAtt, livePos) {
  const myVisits = visits.filter((v) => v.engineer_id === profile.id);
  const today = todayAtt.find((a) => a.user_id === profile.id);
  const active = myVisits.filter((v) => ['assigned', 'en_route', 'on_site'].includes(v.status));
  const done = myVisits.filter((v) => v.status === 'completed');
  const pos = livePos[profile.id];

  const root = el(`<div>
    <div class="grid cols-4 mb-2">
      ${statCard({ label: 'Today', value: today?.check_in ? 'Checked in' : 'Not in', sub: today?.check_in ? new Date(today.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Mark attendance', iconName: 'clock', accent: today?.check_in ? '#16a34a' : '#d97706' })}
      ${statCard({ label: 'Assigned visits', value: active.length, sub: 'in your queue', iconName: 'briefcase', accent: '#2563eb' })}
      ${statCard({ label: 'Completed', value: done.length, sub: 'all time', iconName: 'check', accent: '#16a34a' })}
      ${statCard({ label: 'Live location', value: pos ? 'Sharing' : 'Off', sub: pos ? timeAgo(pos.updated_at) : 'tap to share', iconName: 'map', accent: pos ? '#16a34a' : '#94a0b3' })}
    </div>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h3>My site visits</h3><div class="spacer"></div><a class="badge blue" href="#/visits">Open</a></div>
        <div class="table-wrap">
          ${myVisits.length ? `<table><tbody>${myVisits.slice(0, 8).map((v) => `<tr>
            <td><b>${esc(v.client_name)}</b><br><span class="faint text-sm">${esc(v.address || '')}</span></td>
            <td class="right">${statusBadge(v.status)}</td>
          </tr>`).join('')}</tbody></table>` : emptyState('No visits assigned yet.', 'briefcase')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Quick actions</h3></div>
        <div class="card-pad">
          <a class="btn btn-primary block lg mb-2" href="#/tracking">${icon('map', 18)} Open field map & share location</a>
          <a class="btn btn-ghost block lg mb-2" href="#/attendance">${icon('clock', 18)} ${today?.check_in ? 'Check out' : 'Check in'}</a>
          <a class="btn btn-ghost block lg" href="#/visits">${icon('briefcase', 18)} View assigned jobs</a>
        </div>
      </div>
    </div>
  </div>`);
  return root;
}
