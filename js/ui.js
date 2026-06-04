// ============================================================================
//  Reusable UI building blocks
// ============================================================================
import { $, el, icon, esc } from './util.js';
import { STATUS_BADGE, labelize } from './roles.js';

export function statCard({ label, value, sub, deltaDir, iconName = 'trend', accent = 'var(--primary)' }) {
  return `
    <div class="stat">
      <div class="ic-badge" style="background:${accent}1a;color:${accent}">${icon(iconName, 20)}</div>
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="delta ${deltaDir || ''}">${esc(sub)}</div>` : ''}
    </div>`;
}

export function statusBadge(status) {
  const cls = STATUS_BADGE[status] || 'gray';
  return `<span class="badge ${cls}"><span class="dot"></span>${esc(labelize(status))}</span>`;
}

export function emptyState(text, iconName = 'info') {
  return `<div class="empty"><div class="ic">${icon(iconName, 34)}</div><p>${esc(text)}</p></div>`;
}

/**
 * Open a modal.
 * @returns {{close: Function, root: HTMLElement}}
 */
export function openModal({ title, body, footer }) {
  const host = $('#modal-host');
  const backdrop = el(`
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <div style="flex:1"></div>
          <button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? '<div class="modal-foot"></div>' : ''}
      </div>
    </div>`);

  const bodyEl = backdrop.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  if (footer) {
    const footEl = backdrop.querySelector('.modal-foot');
    if (typeof footer === 'string') footEl.innerHTML = footer;
    else footEl.appendChild(footer);
  }

  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  host.appendChild(backdrop);
  return { close, root: backdrop };
}

/** Simple vertical bar chart from {label, value} array. */
export function barChart(data, { max, accent } = {}) {
  const top = max || Math.max(1, ...data.map((d) => d.value));
  return `
    <div class="bars">
      ${data.map((d) => `
        <div class="bar-col" title="${esc(d.label)}: ${esc(d.display ?? d.value)}">
          <div class="bar" style="height:${Math.max(2, (d.value / top) * 100)}%;${accent ? `background:${accent}` : ''}"></div>
          <div class="bar-label">${esc(d.label)}</div>
        </div>`).join('')}
    </div>`;
}
