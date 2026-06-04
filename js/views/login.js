import { h, toast } from '../util.js';
import { Auth, isDemo } from '../data.js';
import * as Mock from '../mock.js';
import { CONFIG } from '../config.js';
import { roleLabel } from '../roles.js';

export function renderLogin(onSuccess) {
  const wrap = h('div', { className: 'auth-wrap' });

  const hero = h('aside', { className: 'auth-hero' },
    h('div', { className: 'brand' },
      h('div', { className: 'mark', style: 'width:42px;height:42px;border-radius:12px;font-size:16px' }, 'F'),
      CONFIG.COMPANY_NAME,
    ),
    h('div', {},
      h('h1', {}, 'Workforce command center'),
      h('p', { className: 'lead' }, 'Valuation operations across Mumbai, Pune & Delhi — live field tracking, visits, attendance & expenses.'),
      h('div', { className: 'hero-points' },
        h('div', { className: 'hero-point' }, h('div', { className: 'ic' }, '📍'), h('div', { html: '<strong>Live GPS tracking</strong><br/>See teams on the map in real time.' })),
        h('div', { className: 'hero-point' }, h('div', { className: 'ic' }, '🕐'), h('div', { html: '<strong>Attendance & leave</strong><br/>Check-ins and hours in one place.' })),
        h('div', { className: 'hero-point' }, h('div', { className: 'ic' }, '💳'), h('div', { html: '<strong>Expense workflows</strong><br/>Submit, approve, and audit reimbursements.' })),
      ),
    ),
    h('p', { className: 'hero-foot' }, `© 2026 ${CONFIG.COMPANY_NAME} · Workforce management demo`),
  );

  const errEl = h('p', { className: 'form-error', id: 'login-error', 'aria-live': 'polite' });
  const email = h('input', { className: 'input', type: 'email', id: 'email', placeholder: 'you@company.com', autocomplete: 'username', required: '' });
  const password = h('input', { className: 'input', type: 'password', id: 'password', placeholder: '••••••••', autocomplete: 'current-password', required: '' });
  const submitBtn = h('button', { type: 'submit', className: 'btn btn-primary block lg', id: 'login-btn' }, 'Sign in');

  async function attemptSignIn(em, pw) {
    errEl.textContent = '';
    submitBtn.disabled = true;
    try {
      const p = await Auth.signIn(em, pw);
      toast('Welcome back', 'success');
      await onSuccess(p);
    } catch (e) {
      errEl.textContent = e.message;
      submitBtn.disabled = false;
    }
  }

  const form = h('form', { id: 'login-form', novalidate: '' },
    h('div', { className: 'field' }, h('label', { for: 'email' }, 'Email'), email),
    h('div', { className: 'field' }, h('label', { for: 'password' }, 'Password'), password),
    errEl,
    submitBtn,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attemptSignIn(email.value, password.value);
  });

  const cardChildren = [
    h('h2', {}, 'Welcome back'),
    h('p', { className: 'sub' }, isDemo() ? 'Sign in — demo password: demo1234' : 'Sign in to your workspace'),
    form,
  ];

  if (isDemo()) {
    const demoGrid = h('div', { className: 'demo-grid' });
    const featured = ['u-md', 'u-bh1', 'u-tm1', 'u-se1', 'u-dr1', 'u-op1'];
    Mock.db().profiles.filter((p) => featured.includes(p.id)).forEach((p) => {
      const chip = h('button', { type: 'button', className: 'demo-chip' },
        h('strong', {}, roleLabel(p.role)),
        p.email,
      );
      chip.addEventListener('click', () => {
        email.value = p.email;
        password.value = Mock.DEMO_PASSWORD;
        attemptSignIn(p.email, Mock.DEMO_PASSWORD);
      });
      demoGrid.appendChild(chip);
    });
    cardChildren.push(h('div', { className: 'demo-accounts' }, h('h4', {}, 'Demo accounts'), demoGrid));
  }

  wrap.append(hero, h('main', { className: 'auth-panel' }, h('div', { className: 'auth-card' }, ...cardChildren)));
  return wrap;
}
