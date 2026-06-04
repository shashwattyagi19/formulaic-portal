import { h, toast, profileName, profileInitials } from '../util.js';
import { resetDemo, Data } from '../data.js';
import { roleLabel, roleColor, isAdmin } from '../roles.js';
import { isSupabaseConfigured, useDemo } from '../config.js';

export async function renderProfile(profile, onLogout) {
  const branches = await Data.getBranches();
  const branch = branches.find((b) => b.id === profile.branch_id);

  const root = h('div', { className: 'grid cols-2' });

  const card = h('div', { className: 'card card-pad' },
    h('div', { className: 'flex mb-2' },
      h('span', { className: 'avatar lg' }, profileInitials(profile)),
      h('div', {},
        h('h3', { className: 'text-lg bold' }, profileName(profile)),
        h('p', { className: 'muted' }, profile.email),
        h('span', {
          className: `role-tag ${profile.role} mt-1`,
          style: `display:inline-block;margin-top:8px;background:${roleColor(profile.role)}22;color:${roleColor(profile.role)}`,
        }, roleLabel(profile.role)),
      ),
    ),
    h('div', { className: 'field' }, h('label', {}, 'Phone'), h('input', { className: 'input', value: profile.phone || '—', readonly: '' })),
    h('div', { className: 'field' }, h('label', {}, 'Branch'), h('input', { className: 'input', value: branch?.name || 'All branches', readonly: '' })),
    h('button', { type: 'button', className: 'btn btn-primary mt-2', onClick: () => toast('Profile saved', 'success') }, 'Save changes'),
    h('button', { type: 'button', className: 'btn btn-ghost block mt-2', onClick: () => onLogout() }, 'Sign out'),
  );

  const sys = h('div', { className: 'card card-pad' },
    h('h3', { className: 'mb-2' }, 'System'),
    h('p', { className: 'muted text-sm' },
      useDemo() ? 'Demo mode — Mumbai/Pune routes simulated in the browser.' : 'Connected to Supabase.',
    ),
    h('p', { className: 'text-sm faint mt-1' },
      isSupabaseConfigured() ? 'Live backend configured.' : 'Set CONFIG.SUPABASE_URL and CONFIG.SUPABASE_ANON_KEY in js/config.js.',
    ),
  );

  if (isAdmin(profile) && useDemo()) {
    sys.appendChild(h('hr', { style: 'border:none;border-top:1px solid var(--border);margin:20px 0' }));
    sys.appendChild(h('h3', { className: 'mb-2' }, 'Demo data'));
    sys.appendChild(h('p', { className: 'muted text-sm mb-2' }, 'Reset seed data and route simulation.'));
    sys.appendChild(h('button', {
      type: 'button',
      className: 'btn btn-ghost',
      onClick: () => { resetDemo(); toast('Demo data reset', 'info'); },
    }, 'Reset demo data'));
  }

  root.append(card, sys);
  return root;
}
