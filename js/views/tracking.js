// ============================================================================
//  Live Field Map — Swiggy/Zomato-style tracking of site engineers
// ============================================================================
import { el, icon, esc, initials, colorFor, timeAgo, fmtMoney } from '../util.js';
import { Data, isDemo } from '../data.js';
import { roleColor, isField } from '../roles.js';
import { statusBadge } from '../ui.js';
import { CONFIG } from '../config.js';

export async function renderTracking(profile) {
  const [profiles, branches, visits] = await Promise.all([
    Data.getProfiles(), Data.getBranches(), Data.getSiteVisits(),
  ]);

  // Field engineers visible to this user (own branch unless admin).
  let engineers = profiles.filter((p) => isField(p) && p.is_active);
  if (profile.role === 'branch_head' || profile.role === 'technical_manager') {
    engineers = engineers.filter((p) => p.branch_id === profile.branch_id);
  }

  const root = el(`
    <div>
      <div class="toolbar">
        <span class="badge green"><span class="dot"></span> ${engineers.length} engineer${engineers.length === 1 ? '' : 's'} online</span>
        ${isField(profile) ? '<button class="btn btn-primary" id="share-loc">' + icon('pin', 16) + ' Share my location</button>' : ''}
        <div class="spacer"></div>
        <span class="faint text-sm">Updates every ${CONFIG.LOCATION_PING_INTERVAL / 1000}s${isDemo() ? ' · simulated' : ''}</span>
      </div>

      <div class="map-layout">
        <div class="card map-panel">
          <div class="card-head"><h3>Field team</h3><span class="badge gray" id="live-count">live</span></div>
          <div class="list" id="eng-list"></div>
        </div>
        <div style="position:relative">
          <div id="map"></div>
          <div class="map-legend">
            <div class="row"><span class="sw" style="background:#16a34a"></span> On site</div>
            <div class="row"><span class="sw" style="background:#d97706"></span> En route</div>
            <div class="row"><span class="sw" style="background:#2563eb"></span> Available</div>
          </div>
        </div>
      </div>
    </div>
  `);

  // Defer map init until element is in the DOM.
  queueMicrotask(() => initMap(root, { profile, engineers, branches, visits }));
  return root;
}

function visitFor(visits, engId) {
  const active = visits.filter((v) => v.engineer_id === engId && ['en_route', 'on_site', 'assigned'].includes(v.status));
  return active.sort((a, b) => (a.status === 'on_site' ? -1 : 1))[0] || null;
}

function statusColor(visit) {
  if (!visit) return '#2563eb';
  if (visit.status === 'on_site') return '#16a34a';
  if (visit.status === 'en_route') return '#d97706';
  return '#2563eb';
}

function makeIcon(engineer, visit) {
  const color = statusColor(visit);
  return L.divIcon({
    className: '',
    html: `<div class="eng-marker" style="background:${color}"><span>${initials(engineer.full_name)}</span></div>`,
    iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -36],
  });
}

function initMap(root, ctx) {
  const { profile, engineers, branches, visits } = ctx;
  const center = profile.branch_id
    ? branches.find((b) => b.id === profile.branch_id) || branches[0]
    : branches[0];

  const map = L.map(root.querySelector('#map'), { zoomControl: true, attributionControl: true })
    .setView([center?.lat || 19.07, center?.lng || 72.87], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19, subdomains: 'abcd',
  }).addTo(map);

  // Branch office markers.
  branches.forEach((b) => {
    if (b.lat == null) return;
    L.marker([b.lat, b.lng], {
      icon: L.divIcon({ className: '', html: `<div style="background:#0b1020;color:#fff;border-radius:8px;padding:4px 7px;font-size:11px;font-weight:700;box-shadow:0 6px 14px rgba(0,0,0,.25);white-space:nowrap">🏢 ${esc(b.code)}</div>`, iconSize: [40, 22], iconAnchor: [20, 22] }),
    }).addTo(map).bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.address || '')}, ${esc(b.city || '')}`);
  });

  // Site-visit destination pins.
  visits.filter((v) => ['en_route', 'on_site', 'assigned'].includes(v.status) && v.lat != null).forEach((v) => {
    L.marker([v.lat, v.lng], {
      icon: L.divIcon({ className: '', html: `<div style="font-size:22px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.3))">📍</div>`, iconSize: [22, 22], iconAnchor: [11, 22] }),
    }).addTo(map).bindPopup(`<b>${esc(v.client_name)}</b><br>${esc(v.address || '')}<br><span style="color:#5b6678">${esc(v.property_type || '')} · ${fmtMoney(v.estimated_value)}</span>`);
  });

  const markers = {};
  const trails = {};
  const listEl = root.querySelector('#eng-list');
  let selectedId = null;

  function renderList(positions) {
    if (!engineers.length) {
      listEl.innerHTML = '<div class="empty"><p>No field engineers in your scope.</p></div>';
      return;
    }
    listEl.innerHTML = '';
    engineers.forEach((eng) => {
      const pos = positions[eng.id];
      const visit = visitFor(visits, eng.id);
      const online = pos && (Date.now() - new Date(pos.updated_at).getTime() < 120000);
      const item = el(`
        <div class="eng-item ${eng.id === selectedId ? 'active' : ''}" data-id="${eng.id}">
          <div class="avatar ${online ? 'pulse-dot' : ''}" style="background:${colorFor(eng.full_name)}">${initials(eng.full_name)}</div>
          <div class="info">
            <b>${esc(eng.full_name)}</b>
            <small>${visit ? esc(visit.client_name) + ' · ' + statusBadgeText(visit.status) : 'Available'}</small>
          </div>
          <div style="text-align:right">
            <div class="badge ${online ? 'green' : 'gray'}" style="font-size:10px">${online ? Math.round(pos.speed || 0) + ' km/h' : 'offline'}</div>
            <div class="faint" style="font-size:10.5px;margin-top:3px">${pos ? timeAgo(pos.updated_at) : '—'}</div>
          </div>
        </div>`);
      item.addEventListener('click', () => {
        selectedId = eng.id;
        const p = positions[eng.id];
        if (p) map.flyTo([p.lat, p.lng], 15, { duration: .6 });
        markers[eng.id]?.openPopup();
        renderList(positions);
      });
      listEl.appendChild(item);
    });
  }

  function update(positions) {
    engineers.forEach((eng) => {
      const pos = positions[eng.id];
      if (!pos) return;
      const visit = visitFor(visits, eng.id);
      const ll = [pos.lat, pos.lng];

      if (!markers[eng.id]) {
        markers[eng.id] = L.marker(ll, { icon: makeIcon(eng, visit) }).addTo(map);
        markers[eng.id].bindPopup(popupHtml(eng, pos, visit));
        trails[eng.id] = L.polyline([ll], { color: statusColor(visit), weight: 3, opacity: .5, dashArray: '4 6' }).addTo(map);
      } else {
        markers[eng.id].setLatLng(ll);
        markers[eng.id].setIcon(makeIcon(eng, visit));
        markers[eng.id].setPopupContent(popupHtml(eng, pos, visit));
        const line = trails[eng.id];
        const pts = line.getLatLngs(); pts.push(L.latLng(ll));
        if (pts.length > 25) pts.shift();
        line.setLatLngs(pts);
      }
    });
    renderList(positions);
  }

  // Initial paint + live subscription.
  Data.getLivePositions().then(update);
  const unsub = Data.subscribeLive(update);

  // Cleanup when navigating away.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(root)) { unsub(); map.remove(); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Field engineer sharing their own location via the browser.
  const shareBtn = root.querySelector('#share-loc');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      shareBtn.disabled = true; shareBtn.textContent = 'Sharing…';
      navigator.geolocation.watchPosition((p) => {
        Data.pushLocation({
          user_id: profile.id, lat: p.coords.latitude, lng: p.coords.longitude,
          heading: p.coords.heading || 0, speed: (p.coords.speed || 0) * 3.6, battery: null,
        });
        shareBtn.innerHTML = icon('pin', 16) + ' Sharing live';
      }, () => { shareBtn.disabled = false; shareBtn.textContent = 'Location blocked'; }, { enableHighAccuracy: true });
    });
  }
}

function statusBadgeText(s) { return s.replace(/_/g, ' '); }

function popupHtml(eng, pos, visit) {
  return `
    <div style="min-width:190px">
      <div style="font-weight:700;font-size:14px">${esc(eng.full_name)}</div>
      <div style="color:#5b6678;font-size:12px;margin-bottom:6px">${esc(eng.phone || '')}</div>
      ${visit ? `<div style="font-size:12.5px">${icon('briefcase', 13)} ${esc(visit.client_name)} — ${statusBadge(visit.status)}</div>` : '<div style="font-size:12.5px;color:#16a34a">Available</div>'}
      <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;color:#5b6678">
        <span>${icon('trend', 13)} ${Math.round(pos.speed || 0)} km/h</span>
        ${pos.battery != null ? `<span>${icon('battery', 13)} ${pos.battery}%</span>` : ''}
      </div>
      <div style="font-size:11px;color:#94a0b3;margin-top:6px">Updated ${timeAgo(pos.updated_at)}</div>
    </div>`;
}
