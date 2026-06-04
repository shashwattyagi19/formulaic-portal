// ============================================================================
//  Expenses — branch expenditure tracking, budgets & approvals
// ============================================================================
import { el, esc, icon, fmtMoney, fmtMoneyFull, todayISO, initials, colorFor, toast } from '../util.js';
import { Data } from '../data.js';
import { isAdmin, isManager } from '../roles.js';
import { statCard, statusBadge, barChart, emptyState, openModal } from '../ui.js';

const CATEGORIES = ['Travel', 'Fuel', 'Equipment', 'Salary', 'Office Rent', 'Site Survey', 'Utilities', 'Misc'];

export async function renderExpenses(profile) {
  const root = el('<div></div>');
  const branches = await Data.getBranches();

  // Admin can pick any branch; everyone else is locked to their own.
  let activeBranch = isAdmin(profile) ? (branches[0]?.id || null) : profile.branch_id;
  await paint();

  async function paint() {
    const [expenses, profiles] = await Promise.all([
      Data.getExpenses(isAdmin(profile) && !activeBranch ? {} : { branchId: activeBranch }),
      Data.getProfiles(),
    ]);
    const branch = branches.find((b) => b.id === activeBranch);
    const month = new Date().toISOString().slice(0, 7);
    const monthExp = expenses.filter((e) => e.spent_on?.startsWith(month));
    const spent = monthExp.reduce((s, e) => s + Number(e.amount), 0);
    const budget = Number(branch?.monthly_budget || 0);
    const usedPct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const pending = expenses.filter((e) => e.status === 'pending');
    const reimbursed = expenses.filter((e) => e.status === 'reimbursed').reduce((s, e) => s + Number(e.amount), 0);

    const cats = {};
    monthExp.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + Number(e.amount); });
    const chartData = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k.slice(0, 6), value: v }));

    const canApprove = isManager(profile);

    root.innerHTML = `
      <div class="toolbar">
        ${isAdmin(profile) ? `
          <select class="input" id="branch-sel" style="width:auto">
            ${branches.map((b) => `<option value="${b.id}" ${b.id === activeBranch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>` : `<span class="badge blue">${esc(branch?.name || 'Your branch')}</span>`}
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-exp">${icon('plus', 16)} Add expense</button>
      </div>

      <div class="grid cols-4 mb-2">
        ${statCard({ label: 'Spent this month', value: fmtMoney(spent), sub: `of ${fmtMoney(budget)} budget`, iconName: 'wallet', accent: usedPct >= 100 ? '#dc2626' : '#2563eb' })}
        ${statCard({ label: 'Budget remaining', value: fmtMoney(Math.max(0, budget - spent)), sub: `${usedPct}% used`, iconName: 'trend', accent: '#16a34a', deltaDir: usedPct >= 100 ? 'down' : 'up' })}
        ${statCard({ label: 'Pending approvals', value: pending.length, sub: fmtMoney(pending.reduce((s, e) => s + Number(e.amount), 0)), iconName: 'alert', accent: '#d97706' })}
        ${statCard({ label: 'Reimbursed', value: fmtMoney(reimbursed), sub: 'paid out', iconName: 'check', accent: '#0891b2' })}
      </div>

      <div class="grid cols-3 mb-2">
        <div class="card">
          <div class="card-head"><h3>Monthly budget</h3></div>
          <div class="card-pad">
            <div style="font-size:26px;font-weight:800">${fmtMoneyFull(spent)}</div>
            <div class="muted text-sm">of ${fmtMoneyFull(budget)}</div>
            <div class="progress mt-2 ${usedPct >= 100 ? 'over' : ''}"><span style="width:${usedPct}%"></span></div>
            <div class="flex between mt-1 text-sm"><span class="muted">${usedPct}% used</span><span class="${usedPct >= 100 ? 'bold' : 'muted'}" style="${usedPct >= 100 ? 'color:var(--danger)' : ''}">${usedPct >= 100 ? 'Over budget' : fmtMoney(budget - spent) + ' left'}</span></div>
          </div>
        </div>
        <div class="card span-2">
          <div class="card-head"><h3>Spend by category · this month</h3></div>
          <div class="card-pad">${chartData.length ? barChart(chartData) : emptyState('No spend this month.', 'wallet')}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Expense ledger</h3><div class="spacer"></div><span class="badge gray">${expenses.length} entries</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>By</th><th class="right">Amount</th><th>Status</th>${canApprove ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${expenses.slice(0, 60).map((e) => {
                const u = profiles.find((p) => p.id === e.user_id);
                return `<tr>
                  <td class="nowrap">${new Date(e.spent_on).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td><span class="badge gray">${esc(e.category)}</span></td>
                  <td>${esc(e.description || '—')}</td>
                  <td>${u ? esc(u.full_name.split(' ')[0]) : '—'}</td>
                  <td class="right bold">${fmtMoneyFull(e.amount)}</td>
                  <td>${statusBadge(e.status)}</td>
                  ${canApprove ? `<td class="right">${e.status === 'pending'
                    ? `<button class="btn btn-success" data-approve="${e.id}" style="padding:5px 9px">Approve</button> <button class="icon-btn" data-reject="${e.id}" title="Reject">${icon('close', 16)}</button>`
                    : e.status === 'approved'
                      ? `<button class="btn btn-ghost" data-reimburse="${e.id}" style="padding:5px 9px">Mark paid</button>`
                      : ''}</td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${expenses.length ? '' : emptyState('No expenses recorded for this branch yet.', 'wallet')}
        </div>
      </div>
    `;

    root.querySelector('#branch-sel')?.addEventListener('change', (e) => { activeBranch = e.target.value; paint(); });
    root.querySelector('#add-exp').addEventListener('click', () => openAddExpense(profile, activeBranch || profile.branch_id, branches, paint));

    root.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      await Data.updateExpense(b.dataset.approve, { status: 'approved', approved_by: profile.id });
      toast('Expense approved', 'success'); paint();
    }));
    root.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
      await Data.updateExpense(b.dataset.reject, { status: 'rejected' });
      toast('Expense rejected', 'info'); paint();
    }));
    root.querySelectorAll('[data-reimburse]').forEach((b) => b.addEventListener('click', async () => {
      await Data.updateExpense(b.dataset.reimburse, { status: 'reimbursed' });
      toast('Marked as reimbursed', 'success'); paint();
    }));
  }

  return root;
}

function openAddExpense(profile, branchId, branches, onDone) {
  const form = el(`
    <form id="exp-form">
      <div class="form-row">
        <div class="field"><label>Category</label>
          <select class="input" name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Amount (₹)</label><input class="input" name="amount" type="number" min="0" step="100" required placeholder="0" /></div>
      </div>
      ${isAdmin(profile) ? `<div class="field"><label>Branch</label>
        <select class="input" name="branch_id">${branches.map((b) => `<option value="${b.id}" ${b.id === branchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Description</label><input class="input" name="description" placeholder="e.g. Site visit cab fare" /></div>
      <div class="field"><label>Date</label><input class="input" name="spent_on" type="date" value="${todayISO()}" max="${todayISO()}" /></div>
    </form>`);

  const footer = el('<div class="flex"><button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" id="save-exp">Save expense</button></div>');
  const { close } = openModal({ title: 'Add expense', body: form, footer });

  footer.querySelector('[data-cancel]').addEventListener('click', close);
  footer.querySelector('#save-exp').addEventListener('click', async () => {
    const fd = new FormData(form);
    if (!fd.get('amount')) return toast('Enter an amount', 'error');
    await Data.addExpense({
      branch_id: fd.get('branch_id') || branchId,
      user_id: profile.id,
      category: fd.get('category'),
      description: fd.get('description'),
      amount: Number(fd.get('amount')),
      spent_on: fd.get('spent_on'),
      status: isManager(profile) ? 'approved' : 'pending',
    });
    toast('Expense recorded', 'success');
    close(); onDone();
  });
}
