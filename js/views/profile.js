// ============================================================================
//  My Profile
// ============================================================================
import { el, esc, icon, initials, colorFor, fmtDate } from '../util.js';
import { Data, isDemo, resetDemo } from '../data.js';
import { roleLabel, roleColor } from '../roles.js';
import { toast } from '../util.js';

export async function renderProfile(profile, onLogout) {
  const branches = await Data.getBranches();
  const branch = branches.find((b) => b.id === profile.branch_id);

  const root = el(`
    <div class="grid cols-3">
      <div class="card">
        <div class="card-pad" style="text-align:center">
          <div class="avatar lg" style="margin:0 auto;width:84px;height:84px;font-size:28px;background:${colorFor(profile.full_name)}">${initials(profile.full_name)}</div>
          <h3 class="mt-2" style="font-size:20px">${esc(profile.full_name)}</h3>
          <div class="mt-1"><span class="role-tag" style="background:${roleColor(profile.role)}1a;color:${roleColor(profile.role)}">${esc(roleLabel(profile.role))}</span></div>
          <p class="muted text-sm mt-2">${esc(branch?.name || 'Company-wide access')}</p>
          <button class="btn btn-ghost block mt-3" id="logout">${icon('logout', 16)} Sign out</button>
        </div>
      </div>

      <div class="card span-2">
        <div class="card-head"><h3>Account details</h3></div>
        <div class="card-pad">
          <div class="split-list">
            <div class="split-row"><span style="width:140px" class="muted">Full name</span><b>${esc(profile.full_name)}</b></div>
            <div class="split-row"><span style="width:140px" class="muted">Email</span><b>${esc(profile.email)}</b></div>
            <div class="split-row"><span style="width:140px" class="muted">Phone</span><b>${esc(profile.phone || '—')}</b></div>
            <div class="split-row"><span style="width:140px" class="muted">Role</span><b>${esc(roleLabel(profile.role))}</b></div>
            <div class="split-row"><span style="width:140px" class="muted">Branch</span><b>${esc(branch?.name || '—')}</b></div>
            <div class="split-row"><span style="width:140px" class="muted">Status</span>${profile.is_active ? '<span class="badge green"><span class="dot"></span>Active</span>' : '<span class="badge gray">Inactive</span>'}</div>
          </div>

          ${isDemo() ? `
          <div class="mt-3" style="border-top:1px dashed var(--border);padding-top:16px">
            <h4 style="font-size:13px;margin-bottom:6px">Demo controls</h4>
            <p class="muted text-sm mb-2">You're running on simulated data stored in your browser. Reset to restore the original seed data.</p>
            <button class="btn btn-ghost" id="reset-demo">Reset demo data</button>
          </div>` : ''}
        </div>
      </div>
    </div>
  `);

  root.querySelector('#logout').addEventListener('click', onLogout);
  root.querySelector('#reset-demo')?.addEventListener('click', () => {
    resetDemo();
    toast('Demo data reset', 'success');
    setTimeout(() => location.reload(), 600);
  });

  return root;
}
