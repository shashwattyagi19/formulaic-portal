import { h, toast, profileInitials, profileName, colorFor, esc, icon } from '../util.js';
import { statusBadge } from '../ui.js';
import { Data } from '../data.js';
import * as Mock from '../mock.js';
import { CONFIG, useDemo } from '../config.js';
import { isField } from '../roles.js';
import { trackFromCsv, sampleAt, formatClock, TrackPlayer } from '../replay.js';

let mapInstance = null;
let markerMap = new Map();
let trailMap = new Map();
let selectedId = null;
let unsubLive = null;
let geoWatchId = null;

const MAP_CENTER = [19.0760, 72.8777];
const MAP_ZOOM = 11;

const REPLAY_COLOR = '#7c3aed';
const REPLAY_SAMPLES = [
  { path: 'sample/gps.csv', label: 'gps.csv — short track' },
  { path: 'sample/gps-mumbai-field-run.csv', label: 'Mumbai field run' },
];
const SPEED_STEPS = [0.5, 1, 2, 4, 8, 16];
const MAX_TABLE_ROWS = 500;

/** Loaded CSV track + playback state. Survives re-renders of the view. */
const replay = {
  csv: '',
  fileName: '',
  track: null,
  player: null,
  speed: 1,
  loop: false,
  showData: false,
};

let replayLayers = null;
let replayEls = null;
let scrubbing = false;

export function teardownTracking() {
  if (unsubLive) unsubLive();
  unsubLive = null;
  if (geoWatchId != null) {
    navigator.geolocation?.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  replay.player?.pause();
  replayLayers = null;
  replayEls = null;
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
    legendRow(REPLAY_COLOR, 'CSV replay'),
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
    h('div', { className: 'map-side' },
      h('div', { className: 'card map-panel' },
        h('div', { className: 'card-head' },
          h('h3', {}, 'Site engineers'),
          h('span', { className: 'badge green' }, h('span', { className: 'dot' }), `${liveCount} live`),
        ),
        shareBtn ? h('div', { className: 'card-pad', style: 'padding-top:0' }, shareBtn) : null,
        list,
      ),
      buildReplayCard(),
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
  applyInitialView(positions);
  // The container is often still settling when the map is created, and
  // invalidateSize() pans by the size delta — so re-apply the view after it.
  setTimeout(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize();
    applyInitialView(positions);
  }, 120);
}

function applyInitialView(positions) {
  if (!mapInstance) return;
  // A loaded replay track owns the viewport, so fit it instead of centring on
  // an engineer.
  if (replay.track) {
    drawReplayLayers({ fit: true });
    return;
  }
  const sel = positions[selectedId];
  // Unanimated on purpose: an animated setView leaves a ~250ms window during
  // which Leaflet silently drops a fitBounds asked for by a track load.
  if (sel) mapInstance.setView([sel.lat, sel.lng], 14, { animate: false });
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

// ============================================================================
//  CSV track replay
// ============================================================================

function buildReplayCard() {
  const body = h('div', { className: 'card-pad replay-body' });
  const card = h('div', { className: 'card replay-panel' },
    h('div', { className: 'card-head' },
      h('h3', {}, 'Track replay'),
      h('div', { className: 'spacer' }),
      h('span', { className: 'badge' }, 'CSV'),
    ),
    body,
  );
  replayEls = { body };
  renderReplayBody();
  return card;
}

function renderReplayBody() {
  const body = replayEls?.body;
  if (!body) return;
  body.innerHTML = '';

  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', id: 'replay-file', hidden: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      loadReplayCsv(await file.text(), file.name);
    } catch (err) {
      toast(err.message, 'error');
    }
    fileInput.value = '';
  });

  const pickBtn = h('button', { type: 'button', className: 'btn btn-ghost btn-sm' }, 'Load CSV…');
  pickBtn.addEventListener('click', () => fileInput.click());

  const sampleSelect = h('select', { className: 'input input-sm', 'aria-label': 'Load a sample track' },
    h('option', { value: '' }, 'Load sample…'),
    ...REPLAY_SAMPLES.map((s) => h('option', { value: s.path }, s.label)),
  );
  sampleSelect.addEventListener('change', async () => {
    const path = sampleSelect.value;
    sampleSelect.value = '';
    if (!path) return;
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Could not fetch ${path} (${res.status})`);
      loadReplayCsv(await res.text(), path.split('/').pop());
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  body.appendChild(h('div', { className: 'replay-actions' }, pickBtn, sampleSelect, fileInput));

  if (!replay.track) {
    body.appendChild(h('p', { className: 'faint replay-hint' },
      'Load a GPS log with t, lat and lng columns to replay the route on the map.'));
    return;
  }

  body.appendChild(buildReplayControls());
}

function buildReplayControls() {
  const { track } = replay;
  const wrap = h('div', { className: 'replay-controls' });

  wrap.appendChild(h('div', { className: 'replay-file-meta' },
    h('b', { title: replay.fileName }, replay.fileName),
    h('small', { className: 'muted' },
      `${track.points.length} points · ${track.distanceKm.toFixed(2)} km · ${formatClock(track.duration)}`),
  ));

  const playBtn = h('button', { type: 'button', className: 'btn btn-primary btn-sm replay-play', html: `${icon('play', 16)}<span>Play</span>` });
  playBtn.addEventListener('click', () => {
    replay.player.toggle();
    updatePlayButton(replay.player.playing);
  });

  const clock = h('span', { className: 'replay-clock' }, `${formatClock(0)} / ${formatClock(track.duration)}`);

  const speedSelect = h('select', { className: 'input input-sm replay-speed', 'aria-label': 'Playback speed' },
    ...SPEED_STEPS.map((s) => h('option', { value: String(s), ...(s === replay.speed ? { selected: 'selected' } : {}) }, `${s}×`)),
  );
  speedSelect.addEventListener('change', () => {
    replay.speed = Number(speedSelect.value);
    replay.player.setSpeed(replay.speed);
  });

  wrap.appendChild(h('div', { className: 'replay-transport' }, playBtn, clock, speedSelect));

  const scrub = h('input', {
    type: 'range', className: 'replay-scrub', min: '0', max: String(track.duration || 1), step: '0.05', value: '0',
    'aria-label': 'Scrub through track',
  });
  const stopScrub = () => { scrubbing = false; };
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  scrub.addEventListener('pointerup', stopScrub);
  scrub.addEventListener('pointercancel', stopScrub);
  scrub.addEventListener('input', () => replay.player.seek(Number(scrub.value)));
  scrub.addEventListener('change', stopScrub);
  wrap.appendChild(scrub);

  const readCoords = h('b', {}, '—');
  const readSpeed = h('b', {}, '—');
  const readDist = h('b', {}, '—');
  wrap.appendChild(h('div', { className: 'replay-readout' },
    h('div', {}, h('small', {}, 'Position'), readCoords),
    h('div', {}, h('small', {}, 'Speed'), readSpeed),
    h('div', {}, h('small', {}, 'Covered'), readDist),
  ));

  const loopWrap = h('label', { className: 'replay-loop' });
  const loopBox = h('input', { type: 'checkbox', ...(replay.loop ? { checked: 'checked' } : {}) });
  loopBox.addEventListener('change', () => {
    replay.loop = loopBox.checked;
    replay.player.setLoop(replay.loop);
  });
  loopWrap.appendChild(loopBox);
  loopWrap.appendChild(document.createTextNode('Loop'));

  const fitBtn = h('button', { type: 'button', className: 'btn btn-ghost btn-sm' }, 'Fit');
  fitBtn.addEventListener('click', () => {
    if (mapInstance && replay.track) mapInstance.fitBounds(replay.track.bounds, { padding: [30, 30] });
  });

  const dataBtn = h('button', { type: 'button', className: 'btn btn-ghost btn-sm' }, replay.showData ? 'Hide data' : 'Data');
  dataBtn.addEventListener('click', () => {
    replay.showData = !replay.showData;
    renderReplayBody();
    replay.player.emit();
  });

  const downloadBtn = h('button', { type: 'button', className: 'btn btn-ghost btn-sm', html: `${icon('download', 16)}<span>CSV</span>`, title: 'Download this CSV' });
  downloadBtn.addEventListener('click', downloadReplayCsv);

  const clearBtn = h('button', { type: 'button', className: 'btn btn-ghost btn-sm' }, 'Clear');
  clearBtn.addEventListener('click', clearReplay);

  wrap.appendChild(h('div', { className: 'replay-buttons' }, loopWrap, fitBtn, dataBtn, downloadBtn, clearBtn));

  if (replay.showData) wrap.appendChild(buildReplayTable());

  Object.assign(replayEls, { playBtn, clock, scrub, readCoords, readSpeed, readDist, rows: null, playing: false });
  if (replay.showData) replayEls.rows = [...wrap.querySelectorAll('tbody tr')];
  return wrap;
}

function buildReplayTable() {
  const pts = replay.track.points.slice(0, MAX_TABLE_ROWS);
  const table = h('table', { className: 'replay-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 't'), h('th', {}, 'lat'), h('th', {}, 'lng'), h('th', {}, 'km/h'))),
    h('tbody', { html: pts.map((p) => `<tr><td>${p.t.toFixed(1)}</td><td>${p.lat.toFixed(6)}</td><td>${p.lng.toFixed(6)}</td><td>${p.speed.toFixed(1)}</td></tr>`).join('') }),
  );
  const wrap = h('div', { className: 'replay-table-wrap' }, table);
  if (replay.track.points.length > MAX_TABLE_ROWS) {
    wrap.appendChild(h('small', { className: 'faint' },
      `Showing first ${MAX_TABLE_ROWS} of ${replay.track.points.length} points.`));
  }
  return wrap;
}

function loadReplayCsv(text, fileName) {
  const track = trackFromCsv(text, { name: fileName });
  if (track.points.length < 2) throw new Error('Need at least two points to replay a track.');

  replay.player?.destroy();
  replay.csv = text;
  replay.fileName = fileName || 'track.csv';
  replay.track = track;
  replay.player = new TrackPlayer(track, {
    speed: replay.speed,
    loop: replay.loop,
    onFrame: onReplayFrame,
    onEnd: () => updatePlayButton(false),
  });

  renderReplayBody();
  drawReplayLayers({ fit: true });
  replay.player.seek(0);

  track.warnings.forEach((w) => toast(w, 'info'));
  toast(`Loaded ${track.points.length} points from ${replay.fileName}`, 'success');
}

function clearReplay() {
  replay.player?.destroy();
  replay.player = null;
  replay.track = null;
  replay.csv = '';
  replay.fileName = '';
  replay.showData = false;
  clearReplayLayers();
  renderReplayBody();
}

function downloadReplayCsv() {
  if (!replay.csv) return;
  const blob = new Blob([replay.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: replay.fileName || 'track.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Saved ${replay.fileName} to your downloads`, 'success');
}

function clearReplayLayers() {
  if (!replayLayers || !mapInstance) { replayLayers = null; return; }
  Object.values(replayLayers).forEach((layer) => { if (layer) mapInstance.removeLayer(layer); });
  replayLayers = null;
}

/**
 * Fit the map to `bounds`, waiting out any zoom animation that is still
 * running. Leaflet's _tryAnimatedZoom returns "handled" the moment it sees
 * _animatingZoom, before it looks at the animate option, so a fitBounds issued
 * mid-animation is dropped on the floor rather than deferred or forced.
 */
function fitMapToBounds(map, bounds) {
  if (!map || map !== mapInstance) return;
  if (map._animatingZoom) {
    map.once('zoomend', () => fitMapToBounds(map, bounds));
    return;
  }
  map.fitBounds(bounds, { padding: [30, 30], animate: false });
}

function drawReplayLayers({ fit = false } = {}) {
  if (!mapInstance || !window.L || !replay.track) return;
  clearReplayLayers();

  const { track } = replay;
  const route = L.polyline(track.latLngs, {
    color: REPLAY_COLOR, weight: 3, opacity: 0.35, dashArray: '6 7',
  }).addTo(mapInstance);
  const traveled = L.polyline([track.latLngs[0]], {
    color: REPLAY_COLOR, weight: 5, opacity: 0.9,
  }).addTo(mapInstance);
  const start = L.circleMarker(track.latLngs[0], {
    radius: 6, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1,
  }).addTo(mapInstance).bindTooltip('Start');
  const end = L.circleMarker(track.latLngs[track.latLngs.length - 1], {
    radius: 6, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1,
  }).addTo(mapInstance).bindTooltip('End');
  const marker = L.marker(track.latLngs[0], {
    zIndexOffset: 1000,
    icon: L.divIcon({
      className: '',
      html: '<div class="replay-marker"><i></i></div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  }).addTo(mapInstance).bindTooltip(esc(replay.fileName), { direction: 'top', offset: [0, -14] });

  replayLayers = { route, traveled, start, end, marker };
  // Via fitMapToBounds, not fitBounds: the fit has to wait out any zoom
  // animation that is still running (see the helper).
  if (fit) fitMapToBounds(mapInstance, track.bounds);
  if (replay.player) replay.player.emit();
}

function onReplayFrame(pos, player) {
  if (replayLayers && mapInstance) {
    replayLayers.marker.setLatLng([pos.lat, pos.lng]);
    const arrow = replayLayers.marker.getElement()?.querySelector('.replay-marker i');
    if (arrow) arrow.style.transform = `rotate(${pos.heading}deg)`;
    replayLayers.traveled.setLatLngs([
      ...replay.track.latLngs.slice(0, pos.index + 1),
      [pos.lat, pos.lng],
    ]);
  }

  if (!replayEls?.clock) return;
  replayEls.clock.textContent = `${formatClock(pos.time)} / ${formatClock(replay.track.duration)}`;
  replayEls.readCoords.textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
  replayEls.readSpeed.textContent = `${pos.speed.toFixed(1)} km/h`;
  replayEls.readDist.textContent = `${pos.cumKm.toFixed(2)} km`;
  if (!scrubbing) replayEls.scrub.value = String(pos.time);
  updatePlayButton(player.playing);

  if (replayEls.rows) {
    const active = replayEls.rows[Math.min(pos.index, replayEls.rows.length - 1)];
    if (active && !active.classList.contains('active')) {
      replayEls.rows.forEach((r) => r.classList.remove('active'));
      active.classList.add('active');
      active.scrollIntoView({ block: 'nearest' });
    }
  }
}

function updatePlayButton(playing) {
  const btn = replayEls?.playBtn;
  if (!btn || replayEls.playing === playing) return;
  replayEls.playing = playing;
  btn.innerHTML = playing ? `${icon('pause', 16)}<span>Pause</span>` : `${icon('play', 16)}<span>Play</span>`;
}
