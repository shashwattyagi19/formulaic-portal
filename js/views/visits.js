// ============================================================================
//  Site Visits — valuation jobs, assignments & status
// ============================================================================
import { el, esc, icon, fmtMoney, fmtDate, initials, colorFor, toast } from '../util.js';
import { Data } from '../data.js';
import { isAdmin, isManager, isField, labelize } from '../roles.js';
import { statusBadge, statCard, emptyState, openModal } from '../ui.js';

const PROPERTY_TYPES = ['residential', 'commercial', 'industrial', 'land'];
const STATUS_FLOW = ['assigned', 'en_route', 'on_site', 'completed'];

export async function renderVisits(profile) {
  const root = el('<div></div>');
  const [branches] = await Promise.all([Data.getBranches()]);
  let filter = 'all';
  await paint();

  async function paint() {
    const [visits, profiles] = await Promise.all([
      Data.getSiteVisits(
        isField(profile) ? { engineerId: profile.id }
          : isAdmin(profile) ? {} : { branchId: profile.branch_id }
      ),
      Data.getProfiles(),
    ]);
    const engineers = profiles.filter((p) => p.role === 'site_engineer' &&
      (isAdmin(profile) || p.branch_id === profile.branch_id));

    let list = filter === 'all' ? visits : visits.filter((v) => v.status === filter);
    const active = visits.filter((v) => ['en_route', 'on_site'].includes(v.status)).length;
    const pipeline = visits.filter((v) => v.status !== 'cancelled').reduce((s, v) => s + Number(v.estimated_value || 0), 0);

    const canManage = isManager(profile);

    root.innerHTML = `
      <div class="grid cols-4 mb-2">
        ${statCard({ label: 'Total jobs', value: visits.length, iconName: 'briefcase', accent: '#2563eb' })}
        ${statCard({ label: 'In progress', value: active, sub: 'en route / on site', iconName: 'map', accent: '#d97706' })}
        ${statCard({ label: 'Completed', value: visits.filter((v) => v.status === 'completed').length, iconName: 'check', accent: '#16a34a' })}
        ${statCard({ label: 'Pipeline value', value: fmtMoney(pipeline), iconName: 'trend', accent: '#7c3aed' })}
      </div>

      <div class="toolbar">
        <div class="segmented" id="filter">
          ${['all', ...STATUS_FLOW, 'cancelled'].map((s) => `<button data-f="${s}" class="${filter === s ? 'active' : ''}">${labelize(s)}</button>`).join('')}
        </div>
        <div class="spacer"></div>
        ${canManage ? `<button class="btn btn-primary" id="add-visit">${icon('plus', 16)} New job</button>` : ''}
      </div>

      <div class="grid cols-2" id="visit-grid">
        ${list.length ? list.map((v) => {
          const eng = profiles.find((p) => p.id === v.engineer_id);
          return `
          <div class="card">
            <div class="card-pad">
              <div class="flex between">
                <div><h3 style="font-size:16px">${esc(v.client_name)}</h3><span class="faint text-sm">${esc(labelize(v.property_type || ''))}</span></div>
                ${statusBadge(v.status)}
              </div>
              <div class="flex mt-2 text-sm muted">${icon('pin', 15)} ${esc(v.address || '—')}</div>
              <div class="flex between mt-2">
                <span class="text-sm muted">${icon('calendar', 14)} ${fmtDate(v.scheduled_at)}</span>
                <b>${fmtMoney(v.estimated_value)}</b>
              </div>
              <div class="flex between mt-2" style="border-top:1px solid var(--border);padding-top:12px">
                <div class="flex">
                  ${eng ? `<div class="avatar sm" style="background:${colorFor(eng.full_name)}">${initials(eng.full_name)}</div><span class="text-sm">${esc(eng.full_name)}</span>` : '<span class="faint text-sm">Unassigned</span>'}
                </div>
                <div class="flex" data-actions="${v.id}"></div>
              </div>
            </div>
          </div>`;
        }).join('') : `<div style="grid-column:1/-1">${emptyState('No site visits in this view.', 'briefcase')}</div>`}
      </div>
    `;

    // Filter buttons
    root.querySelector('#filter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      filter = b.dataset.f; paint();
    });

    root.querySelector('#add-visit')?.addEventListener('click', () => openAddVisit(profile, branches, engineers, paint));

    // Per-card actions: advance status (field engineer or manager), assign.
    list.forEach((v) => {
      const slot = root.querySelector(`[data-actions="${v.id}"]`);
      if (!slot) return;
      const idx = STATUS_FLOW.indexOf(v.status);
      const mine = v.engineer_id === profile.id;
      if ((mine || canManage) && idx >= 0 && idx < STATUS_FLOW.length - 1) {
        const next = STATUS_FLOW[idx + 1];
        const btn = el(`<button class="btn btn-primary" style="padding:6px 11px">${labelize(next === 'on_site' ? 'arrive' : next)}</button>`);
        btn.addEventListener('click', async () => {
          const patch = { status: next };
          if (next === 'completed') patch.completed_at = new Date().toISOString();
          await Data.updateSiteVisit(v.id, patch);
          toast(`Marked ${labelize(next)}`, 'success'); paint();
        });
        slot.appendChild(btn);
      }
      if (canManage && !v.engineer_id) {
        const btn = el(`<button class="btn btn-ghost" style="padding:6px 11px">Assign</button>`);
        btn.addEventListener('click', () => openAssign(v, engineers, paint));
        slot.appendChild(btn);
      }
    });
  }

  return root;
}

function openAddVisit(profile, branches, engineers, onDone) {
  const form = el(`
    <form id="visit-form">
      <div class="field"><label>Client name</label><input class="input" name="client_name" required placeholder="e.g. HDFC Bank" /></div>
      <div class="form-row">
        <div class="field"><label>Property type</label><select class="input" name="property_type">${PROPERTY_TYPES.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
        <div class="field"><label>Est. value (₹)</label><input class="input" name="estimated_value" type="number" min="0" step="100000" placeholder="0" /></div>
      </div>
      <div class="field"><label>Address</label><input class="input" name="address" placeholder="Property location" /></div>
      <div class="form-row">
        <div class="field"><label>Assign engineer</label>
          <select class="input" name="engineer_id"><option value="">— Unassigned —</option>${engineers.map((e) => `<option value="${e.id}">${esc(e.full_name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Scheduled</label><input class="input" name="scheduled_at" type="date" /></div>
      </div>
    </form>`);
  const footer = el('<div class="flex"><button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" id="save">Create job</button></div>');
  const { close } = openModal({ title: 'New valuation job', body: form, footer });
  footer.querySelector('[data-cancel]').addEventListener('click', close);
  footer.querySelector('#save').addEventListener('click', async () => {
    const fd = new FormData(form);
    if (!fd.get('client_name')) return toast('Enter a client name', 'error');
    await Data.addSiteVisit({
      branch_id: profile.branch_id || branches[0]?.id,
      engineer_id: fd.get('engineer_id') || null,
      client_name: fd.get('client_name'),
      property_type: fd.get('property_type'),
      address: fd.get('address'),
      estimated_value: Number(fd.get('estimated_value') || 0),
      scheduled_at: fd.get('scheduled_at') ? new Date(fd.get('scheduled_at')).toISOString() : null,
      status: 'assigned',
    });
    toast('Job created', 'success'); close(); onDone();
  });
}

function openAssign(visit, engineers, onDone) {
  const form = el(`<form><div class="field"><label>Assign to engineer</label>
    <select class="input" name="engineer_id">${engineers.map((e) => `<option value="${e.id}">${esc(e.full_name)}</option>`).join('')}</select></div></form>`);
  const footer = el('<div class="flex"><button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" id="save">Assign</button></div>');
  const { close } = openModal({ title: `Assign · ${visit.client_name}`, body: form, footer });
  footer.querySelector('[data-cancel]').addEventListener('click', close);
  footer.querySelector('#save').addEventListener('click', async () => {
    await Data.updateSiteVisit(visit.id, { engineer_id: new FormData(form).get('engineer_id') });
    toast('Engineer assigned', 'success'); close(); onDone();
  });
}
