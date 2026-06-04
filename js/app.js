// ============================================================================
//  Formulaic Portal — application bootstrap & router
// ============================================================================
import { $, toast } from './util.js';
import { Auth } from './data.js';
import { isDemo } from './data.js';
import { teardownTracking } from './views/tracking.js';
import { canAccess } from './roles.js';
import { renderShell, setPageMeta, setActiveNav } from './layout.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTracking } from './views/tracking.js';
import { renderAttendance } from './views/attendance.js';
import { renderExpenses } from './views/expenses.js';
import { renderEmployees } from './views/employees.js';
import { renderVisits } from './views/visits.js';
import { renderProfile } from './views/profile.js';

const app = $('#app');
let profile = null;

const ROUTES = {
  dashboard:  renderDashboard,
  tracking:   renderTracking,
  attendance: renderAttendance,
  expenses:   renderExpenses,
  employees:  renderEmployees,
  visits:     renderVisits,
  profile:    (p) => renderProfile(p, logout),
};

function parseHash() {
  const h = (location.hash || '#/dashboard').replace(/^#\//, '');
  return h.split('?')[0] || 'dashboard';
}

async function mountView(route) {
  if (!ROUTES[route] || !canAccess(route, profile.role)) route = 'dashboard';
  if (route !== 'tracking') teardownTracking();
  setActiveNav(route);
  setPageMeta(route);
  const root = $('#view-root');
  root.innerHTML = '<div class="boot-loader" style="position:static;min-height:50vh"><div class="spinner"></div></div>';
  try {
    const view = await ROUTES[route](profile);
    root.innerHTML = '';
    root.appendChild(view);
    root.scrollTo?.(0, 0);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="empty"><p>Something went wrong loading this page.</p><pre class="faint" style="font-size:12px">${e.message}</pre></div>`;
  }
}

function onNavigate(action) {
  if (action === '__logout__') return logout();
}

async function showApp() {
  app.innerHTML = '';
  app.appendChild(renderShell(profile, parseHash(), onNavigate));
  await mountView(parseHash());
}

function showLogin() {
  app.innerHTML = '';
  app.appendChild(renderLogin(async (p) => {
    profile = p;
    if (!location.hash) location.hash = '#/dashboard';
    await showApp();
  }));
}

async function logout() {
  await Auth.signOut();
  profile = null;
  location.hash = '';
  showLogin();
}

window.addEventListener('hashchange', () => {
  if (profile) mountView(parseHash());
});

function showFileProtocolHelp() {
  app.innerHTML = `
    <div class="auth-wrap" style="grid-template-columns:1fr">
      <div class="auth-panel">
        <div class="auth-card" style="max-width:540px">
          <h2>Serve this over http://</h2>
          <p class="sub">The portal uses JavaScript modules, which browsers block when a page is opened directly from disk (a <code>file://</code> URL).</p>
          <p class="text-sm muted">Start a quick local server from the project folder, then reload:</p>
          <pre style="background:var(--surface-3);padding:14px;border-radius:10px;overflow:auto;font-size:13px">python3 -m http.server 5173
# or
npx serve -l 5173 .</pre>
          <p class="text-sm muted mt-2">Then open <b>http://localhost:5173</b></p>
        </div>
      </div>
    </div>`;
}

(async function boot() {
  if (location.protocol === 'file:') { showFileProtocolHelp(); return; }
  try {
    profile = await Auth.restore();
  } catch (e) {
    console.warn('Session restore failed:', e);
  }
  if (profile) await showApp();
  else showLogin();

  if (isDemo()) {
    console.info('%cFormulaic Portal — demo mode', 'color:#2563eb;font-weight:bold',
      '\nUsing simulated data. Set CONFIG.SUPABASE_* in js/config.js and DEMO_MODE: false to go live.');
  }
})();
