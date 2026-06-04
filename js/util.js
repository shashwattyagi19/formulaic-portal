// ============================================================================
//  Small DOM + formatting helpers (no dependencies)
// ============================================================================

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Create an element from an HTML string. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Escape user-supplied text before injecting into HTML. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export const fmtMoney = (n, currency = '₹') => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e7) return `${currency}${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `${currency}${(v / 1e5).toFixed(2)} L`;
  return currency + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

export const fmtMoneyFull = (n, currency = '₹') =>
  currency + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
export function timeAgo(d) {
  if (!d) return 'never';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

/** Deterministic color from a string (for avatars). */
export function colorFor(str = '') {
  const palette = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#db2777', '#0d9488', '#ea580c'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const uid = () => 'id-' + Math.random().toString(36).slice(2, 10);

/** Distance between two lat/lng points in km (haversine). */
export function distanceKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function toast(message, type = 'info', ms = 3200) {
  const host = $('#toast-host');
  const node = el(`<div class="toast ${type}">${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}<span>${esc(message)}</span></div>`);
  host.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; node.style.transition = 'opacity .25s'; setTimeout(() => node.remove(), 260); }, ms);
}

// --- Inline SVG icon set ----------------------------------------------------
const ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  map: '<path d="M15 19l-6-2.11V5l6 2.11M21 5v14l-6 2-6-2-6 2V7l6-2 6 2 6-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  clock: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-4V7h2v4h2v2z"/>',
  wallet: '<path d="M21 7H5a1 1 0 010-2h15V3H5a3 3 0 00-3 3v12a3 3 0 003 3h16a1 1 0 001-1V8a1 1 0 00-1-1zm-3 8a2 2 0 110-4 2 2 0 010 4z"/>',
  users: '<path d="M16 11a4 4 0 10-4-4 4 4 0 004 4zm-8 0a4 4 0 10-4-4 4 4 0 004 4zm0 2c-3 0-7 1.5-7 4.5V20h7m1 0h13v-2.5c0-3-4-4.5-7-4.5a9 9 0 00-6 2.2"/>',
  briefcase: '<path d="M20 7h-4V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm-6 0h-4V5h4z"/>',
  user: '<path d="M12 12a5 5 0 10-5-5 5 5 0 005 5zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z"/>',
  logout: '<path d="M16 17l5-5-5-5v3H9v4h7v3zM4 4h8V2H4a2 2 0 00-2 2v16a2 2 0 002 2h8v-2H4V4z"/>',
  check: '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
  alert: '<path d="M12 2L1 21h22L12 2zm1 15h-2v2h2v-2zm0-7h-2v5h2v-5z"/>',
  info: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
  close: '<path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 10.6 12 4.3 5.7l1.4-1.4L12 10.6l4.9-4.9z"/>',
  search: '<path d="M21 20l-5.6-5.6a7 7 0 10-1.4 1.4L20 21zM5 10a5 5 0 1110 0 5 5 0 01-10 0z"/>',
  menu: '<path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>',
  pin: '<path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5z"/>',
  phone: '<path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11 11 0 003.5.56 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.56 3.5 1 1 0 01-.24 1l-2.2 2.3z"/>',
  battery: '<path d="M16 6H4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-1h2v-6h-2V8a2 2 0 00-2-2z"/>',
  trend: '<path d="M3.5 18.5l6-6 4 4L22 6.9 20.6 5.5 13.5 12.6l-4-4L2 16z"/>',
  building: '<path d="M3 21h18v-2H3v2zM5 3v15h6V3H5zm8 4v11h6V7h-6zM7 6h2v2H7V6zm0 4h2v2H7v-2zm8 0h2v2h-2v-2zm0 4h2v2h-2v-2z"/>',
  calendar: '<path d="M7 2v2H4a1 1 0 00-1 1v15a1 1 0 001 1h16a1 1 0 001-1V5a1 1 0 00-1-1h-3V2h-2v2H9V2H7zM4 8h16v11H4V8z"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  download: '<path d="M12 16l5-5-1.4-1.4L13 12.2V4h-2v8.2L8.4 9.6 7 11l5 5zm-7 2v2h14v-2H5z"/>',
};
export function icon(name, size = 20) {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="ic-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}
