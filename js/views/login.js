// ============================================================================
//  Login view
// ============================================================================
import { $, el, icon, esc, toast } from '../util.js';
import { CONFIG } from '../config.js';
import { Auth, isDemo } from '../data.js';
import * as Mock from '../mock.js';

const DEMO_LOGINS = [
  { email: 'md@formulaic.in',         role: 'Managing Director' },
  { email: 'head.mumbai@formulaic.in',role: 'Branch Head' },
  { email: 'tech@formulaic.in',       role: 'Technical Manager' },
  { email: 'imran@formulaic.in',      role: 'Site Engineer' },
  { email: 'drafter@formulaic.in',    role: 'Drafter' },
  { email: 'operator@formulaic.in',   role: 'Operator' },
];

export function renderLogin(onSuccess) {
  const root = el(`
    <div class="auth-wrap">
      <section class="auth-hero">
        <div class="brand">${icon('building', 22)} ${esc(CONFIG.COMPANY_NAME)}</div>
        <div>
          <h1>Run your valuation field operations in one place.</h1>
          <p class="lead">Track site engineers live on the map, capture attendance, and keep every branch's expenditure under control.</p>
          <div class="hero-points">
            <div class="hero-point"><span class="ic">${icon('map', 18)}</span><div><b>Live engineer tracking</b><br><span style="opacity:.8">Watch field staff move in real time, just like a delivery app.</span></div></div>
            <div class="hero-point"><span class="ic">${icon('clock', 18)}</span><div><b>Attendance built-in</b><br><span style="opacity:.8">Geo-stamped check-in / check-out for every employee.</span></div></div>
            <div class="hero-point"><span class="ic">${icon('wallet', 18)}</span><div><b>Branch expense control</b><br><span style="opacity:.8">Budgets, approvals and reimbursements for the MD.</span></div></div>
          </div>
        </div>
        <div class="hero-foot">Site Engineers · Drafters · Operators · Technical Managers · Branch Heads</div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <h2>Welcome back</h2>
          <p class="sub">Sign in to access your portal.</p>
          <form id="login-form">
            <div class="field">
              <label for="email">Email</label>
              <input class="input" type="email" id="email" autocomplete="username" placeholder="you@formulaic.in" required />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input class="input" type="password" id="password" autocomplete="current-password" placeholder="••••••••" required />
            </div>
            <p class="form-error" id="login-error"></p>
            <button class="btn btn-primary block lg" type="submit" id="login-btn">Sign in</button>
          </form>

          ${isDemo() ? `
          <div class="demo-accounts">
            <h4>Demo accounts · password <strong>demo1234</strong></h4>
            <div class="demo-grid" id="demo-grid">
              ${DEMO_LOGINS.map((d) => `
                <button class="demo-chip" data-email="${esc(d.email)}">
                  <strong>${esc(d.role)}</strong>${esc(d.email)}
                </button>`).join('')}
            </div>
          </div>` : ''}
        </div>
      </section>
    </div>
  `);

  const form = root.querySelector('#login-form');
  const errEl = root.querySelector('#login-error');
  const btn = root.querySelector('#login-btn');

  async function attempt(email, password) {
    errEl.textContent = '';
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const profile = await Auth.signIn(email, password);
      toast(`Welcome, ${profile.full_name.split(' ')[0]}!`, 'success');
      onSuccess(profile);
    } catch (e) {
      errEl.textContent = e.message || 'Sign in failed.';
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attempt($('#email', root).value, $('#password', root).value);
  });

  root.querySelectorAll('.demo-chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      $('#email', root).value = chip.dataset.email;
      $('#password', root).value = Mock.DEMO_PASSWORD;
      attempt(chip.dataset.email, Mock.DEMO_PASSWORD);
    }));

  return root;
}
