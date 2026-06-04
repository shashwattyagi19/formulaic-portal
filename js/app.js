// ============================================================================
//  Formulaic Portal — application bootstrap & router
// ============================================================================
import { $, toast } from './util.js';
import { Auth, isDemo } from './data.js';
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

(async function boot() {
  try {
    profile = await Auth.restore();
  } catch (e) {
    console.warn('Session restore failed:', e);
  }
  if (profile) await showApp();
  else showLogin();

  if (isDemo()) {
    console.info('%cFormulaic Portal — demo mode', 'color:#2563eb;font-weight:bold',
      '\nUsing simulated data. Configure Supabase in js/config.js to go live.');
  }
})();
