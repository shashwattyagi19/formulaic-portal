// ============================================================================
//  App shell: sidebar navigation + topbar
// ============================================================================
import { $, el, icon, initials, colorFor, esc } from './util.js';
import { NAV, ROLES, roleLabel, canAccess } from './roles.js';
import { CONFIG } from './config.js';
import { isDemo } from './data.js';

const PAGE_META = {
  dashboard:  { title: 'Dashboard',        sub: 'Operational overview at a glance' },
  tracking:   { title: 'Live Field Map',   sub: 'Real-time location of site engineers' },
  visits:     { title: 'Site Visits',      sub: 'Valuation jobs & assignments' },
  attendance: { title: 'Attendance',       sub: 'Daily check-in / check-out records' },
  expenses:   { title: 'Expenses',         sub: 'Branch expenditure & reimbursements' },
  employees:  { title: 'Employees',        sub: 'Team directory & roles' },
  profile:    { title: 'My Profile',       sub: 'Your account details' },
};

export function renderShell(profile, activeRoute, onNavigate) {
  const items = NAV.filter((n) => canAccess(n.id, profile.role));
  const meta = PAGE_META[activeRoute] || { title: 'Portal', sub: '' };

  const shell = el(`
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="logo">
          <div class="mark">F</div>
          <div>
            <b>${esc(CONFIG.COMPANY_NAME)}</b>
            <small>Field & Branch Portal</small>
          </div>
        </div>
        <nav class="nav" id="nav">
          <div class="nav-section">Menu</div>
        </nav>
        <div class="sidebar-foot">
          <a href="#/profile" class="user-pill" data-route="profile">
            <div class="avatar" style="background:${colorFor(profile.full_name)}">${initials(profile.full_name)}</div>
            <div class="info">
              <b>${esc(profile.full_name)}</b>
              <small>${esc(roleLabel(profile.role))}</small>
            </div>
          </a>
          <button class="btn btn-ghost block mt-1" id="logout-btn" style="color:#aeb9d4;border-color:rgba(255,255,255,.1);background:transparent">
            ${icon('logout', 18)} Sign out
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-toggle" id="menu-toggle" aria-label="Menu">${icon('menu')}</button>
          <div class="page-title">
            <h1 id="page-title">${esc(meta.title)}</h1>
            <p id="page-sub">${esc(meta.sub)}</p>
          </div>
          <div class="spacer"></div>
          ${isDemo() ? '<span class="badge amber" title="Running on simulated data. Configure Supabase in js/config.js to go live.">Demo mode</span>' : '<span class="badge green"><span class="dot"></span> Live</span>'}
        </header>
        <main class="content" id="view-root"></main>
      </div>
    </div>
  `);

  const nav = shell.querySelector('#nav');
  for (const item of items) {
    const a = el(`
      <a href="#/${item.id}" data-route="${item.id}" class="${item.id === activeRoute ? 'active' : ''}">
        <span class="ic">${icon(item.icon, 19)}</span>
        <span>${esc(item.label)}</span>
      </a>`);
    nav.appendChild(a);
  }

  // Sidebar toggle (mobile)
  const sidebar = shell.querySelector('#sidebar');
  shell.querySelector('#menu-toggle').addEventListener('click', () => {
    sidebar.classList.add('open');
    const scrim = el('<div class="sidebar-scrim"></div>');
    scrim.addEventListener('click', () => { sidebar.classList.remove('open'); scrim.remove(); });
    shell.appendChild(scrim);
  });
  nav.addEventListener('click', () => { sidebar.classList.remove('open'); $('.sidebar-scrim')?.remove(); });

  shell.querySelector('#logout-btn').addEventListener('click', () => onNavigate('__logout__'));

  return shell;
}

export function setPageMeta(route) {
  const meta = PAGE_META[route];
  if (!meta) return;
  const t = $('#page-title'), s = $('#page-sub');
  if (t) t.textContent = meta.title;
  if (s) s.textContent = meta.sub;
}

export function setActiveNav(route) {
  document.querySelectorAll('.nav a').forEach((a) =>
    a.classList.toggle('active', a.dataset.route === route));
}
