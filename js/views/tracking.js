import { h, toast, profileInitials, profileName, colorFor } from '../util.js';
import { statusBadge } from '../ui.js';
import { Data } from '../data.js';
import * as Mock from '../mock.js';
import { CONFIG, useDemo } from '../config.js';
import { isField } from '../roles.js';

let mapInstance = null;
let markerMap = new Map();
let trailMap = new Map();
let selectedId = null;
let unsubLive = null;
let geoWatchId = null;

const MAP_CENTER = [19.0760, 72.8777];
const MAP_ZOOM = 11;

export function teardownTracking() {
  if (unsubLive) unsubLive();
  unsubLive = null;
  if (geoWatchId != null) {
    navigator.geolocation?.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerMap.clear();
    trailMap.clear();
  }
}

function visitStatusForEngineer(engineerId) {
  const v = Mock.db().site_visits.find((x) => x.engineer_id === engineerId && ['on_site', 'en_route', 'assigned'].includes(x.status));
  return v?.status || 'available';
}

export async function renderTracking(profile) {
  teardownTracking();

  const [profiles, positions] = await Promise.all([
    Data.getProfiles(),
    Data.getLivePositions(),
  ]);

  const engineers = profiles.filter((p) => p.role === 'site_engineer');
  if (!selectedId) selectedId = engineers[0]?.id;

  const list = h('div', { className: 'list' });

  function renderList(pos) {
    list.innerHTML = '';
    engineers.forEach((p) => {
      const live = pos[p.id];
      if (!live) return;
      const visit = Mock.db().site_visits.find((v) => v.engineer_id === p.id && ['on_site', 'en_route'].includes(v.status));
      const job = visit ? `${visit.client_name} · ${visit.status.replace('_', ' ')}` : 'Available';
      const st = visitStatusForEngineer(p.id);
      const item = h('div', {
        className: `eng-item${p.id === selectedId ? ' active' : ''}`,
        'data-eng': p.id,
      },
        h('span', {
          className: `avatar sm${['on_site', 'en_route'].includes(st) ? ' pulse-dot' : ''}`,
          style: `background:${colorFor(p.full_name)}`,
        }, profileInitials(p)),
        h('div', { className: 'info' }, h('b', {}, profileName(p)), h('small', {}, `${job} · ${live.lat.toFixed(4)}, ${live.lng.toFixed(4)}`)),
      );
      item.appendChild(h('div', { html: statusBadge(['on_site', 'en_route', 'assigned'].includes(st) ? st : 'assigned') }));
      item.addEventListener('click', () => {
        selectedId = p.id;
        remountTracking(profile);
      });
      list.appendChild(item);
    });
  }

  renderList(positions);

  const mapEl = h('div', { id: 'map' });
  const legend = h('div', { className: 'map-legend' },
    legendRow('#2563eb', 'On site'),
    legendRow('#d97706', 'En route'),
    legendRow('#0891b2', 'Assigned'),
    legendRow('#16a34a', 'Available'),
  );
  if (useDemo()) {
    legend.appendChild(h('div', { className: 'row faint', style: 'margin-top:4px;font-size:11px' },
      `Route simulation · every ${CONFIG.LOCATION_PING_INTERVAL / 1000}s`));
  }

  const liveCount = engineers.filter((p) => positions[p.id]).length;

  const shareBtn = (!useDemo() && isField(profile))
    ? h('button', { type: 'button', className: 'btn btn-primary btn-sm', id: 'share-location' }, 'Share my location')
    : null;

  const layout = h('div', { className: 'map-layout' },
    h('div', { className: 'card map-panel' },
      h('div', { className: 'card-head' },
        h('h3', {}, 'Site engineers'),
        h('span', { className: 'badge green' }, h('span', { className: 'dot' }), `${liveCount} live`),
      ),
      shareBtn ? h('div', { className: 'card-pad', style: 'padding-top:0' }, shareBtn) : null,
      list,
    ),
    h('div', { className: 'map-wrap card', style: 'padding:0;border:none;background:transparent;box-shadow:none' },
      mapEl,
      legend,
    ),
  );

  if (shareBtn) {
    shareBtn.addEventListener('click', () => startLocationShare(profile, shareBtn));
  }

  requestAnimationFrame(() => {
    drawMap(engineers, positions);
    unsubLive = Data.subscribeLive((pos) => {
      if (!document.getElementById('map')) {
        teardownTracking();
        return;
      }
      renderList(pos);
      updateMarkers(engineers, pos);
    });
  });

  return layout;
}

function startLocationShare(profile, btn) {
  if (!navigator.geolocation) {
    toast('Geolocation is not available in this browser', 'error');
    return;
  }
  if (geoWatchId != null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
    btn.textContent = 'Share my location';
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    toast('Stopped sharing location', 'info');
    return;
  }
  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      Data.pushLocation({
        user_id: profile.id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? 0,
        speed: Math.max(0, (pos.coords.speed || 0) * 3.6),
        battery: null,
      }).catch(() => {});
    },
    () => toast('Could not read GPS — check permissions', 'error'),
    { enableHighAccuracy: true, maximumAge: CONFIG.LOCATION_PING_INTERVAL },
  );
  btn.textContent = 'Stop sharing';
  btn.classList.replace('btn-primary', 'btn-ghost');
  toast('Sharing live location', 'success');
}

function remountTracking(profile) {
  renderTracking(profile).then((v) => {
    const root = document.getElementById('view-root');
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(v);
  });
}

function legendRow(color, label) {
  return h('div', { className: 'row' }, h('span', { className: 'sw', style: `background:${color}` }), label);
}

function drawMap(engineers, positions) {
  if (!window.L || !document.getElementById('map')) return;
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerMap.clear();
  }
  mapInstance = L.map('map').setView(MAP_CENTER, MAP_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(mapInstance);
  updateMarkers(engineers, positions);
  const sel = positions[selectedId];
  if (sel) mapInstance.setView([sel.lat, sel.lng], 14);
  setTimeout(() => mapInstance?.invalidateSize(), 120);
}

function updateMarkers(engineers, positions) {
  if (!mapInstance || !window.L) return;
  engineers.forEach((p) => {
    const live = positions[p.id];
    if (!live) return;
    const color = colorFor(p.full_name);
    const visit = Mock.db().site_visits.find((v) => v.engineer_id === p.id && ['on_site', 'en_route'].includes(v.status));
    let m = markerMap.get(p.id);
    if (!m) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="eng-marker" style="background:${color}"><span>${profileInitials(p)}</span></div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });
      m = L.marker([live.lat, live.lng], { icon })
        .addTo(mapInstance)
        .bindPopup(`<b>${profileName(p)}</b><br/><span class="muted">${visit?.client_name || 'En route'}</span><br/><small>${Math.round(live.speed)} km/h · ${live.battery}% batt</small>`);
      markerMap.set(p.id, m);
    } else {
      m.setLatLng([live.lat, live.lng]);
    }
    const trail = trailMap.get(p.id) || [];
    const next = [...trail, [live.lat, live.lng]].slice(-24);
    trailMap.set(p.id, next);
    let line = trailMap.get(`${p.id}-line`);
    if (next.length > 1) {
      if (!line) {
        line = L.polyline(next, { color, weight: 3, opacity: 0.45 }).addTo(mapInstance);
        trailMap.set(`${p.id}-line`, line);
      } else {
        line.setLatLngs(next);
      }
    }
  });
}
