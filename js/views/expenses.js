import { h, toast, fmtMoneyFull } from '../util.js';
import { statusBadge } from '../ui.js';
import { Data } from '../data.js';
import * as Mock from '../mock.js';
import { isField, isAdmin } from '../roles.js';

export async function renderExpenses(profile) {
  const branchFilter = isAdmin(profile) ? {} : { branchId: profile.branch_id };
  let rows = await Data.getExpenses(branchFilter);
  if (isField(profile)) rows = rows.filter((e) => e.user_id === profile.id);

  const root = h('div', {});
  const canApprove = isAdmin(profile) || profile.role === 'branch_head';

  if (isField(profile) || profile.role === 'operator') {
    const addBtn = h('button', { type: 'button', className: 'btn btn-primary mb-2' }, '+ Submit expense');
    addBtn.addEventListener('click', async () => {
      await Data.addExpense({
        user_id: profile.id,
        branch_id: profile.branch_id,
        category: 'Travel',
        amount: 2500,
        spent_on: new Date().toISOString().slice(0, 10),
        description: 'Submitted from portal',
      });
      toast('Expense submitted', 'success');
      document.getElementById('view-root').innerHTML = '';
      document.getElementById('view-root').appendChild(await renderExpenses(profile));
    });
    root.appendChild(addBtn);
  }

  const tbody = h('tbody');
  rows.slice(0, 50).forEach((x) => {
    const tr = h('tr',
      h('td', {}, Mock.nameByUserId(x.user_id)),
      h('td', {}, x.category),
      h('td', { className: 'right' }, fmtMoneyFull(x.amount)),
      h('td', { className: 'faint' }, x.spent_on),
    );
    tr.appendChild(h('td', { html: statusBadge(x.status) }));
    tr.appendChild(h('td', { className: 'muted text-sm' }, x.description || ''));
    if (canApprove && x.status === 'pending') {
      const actions = h('td');
      const approve = h('button', { type: 'button', className: 'btn btn-success', style: 'padding:6px 10px;font-size:12px' }, 'Approve');
      approve.addEventListener('click', async () => {
        await Data.updateExpense(x.id, { status: 'approved' });
        toast('Expense approved', 'success');
        document.getElementById('view-root').innerHTML = '';
        document.getElementById('view-root').appendChild(await renderExpenses(profile));
      });
      actions.appendChild(approve);
      tr.appendChild(actions);
    }
    tbody.appendChild(tr);
  });

  root.appendChild(h('div', { className: 'card' },
    h('div', { className: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          ...['Employee', 'Category', 'Amount', 'Date', 'Status', 'Note', canApprove ? 'Actions' : null].filter(Boolean).map((h) => h('th', {}, h)),
        )),
        tbody,
      ),
    ),
  ));
  return root;
}
