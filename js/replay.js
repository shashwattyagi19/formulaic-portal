// ============================================================================
//  GPS track replay — CSV parsing, geometry and a playback clock.
//
//  Turns a `t,lat,lng` CSV (the format field devices and GPS loggers export)
//  into a track that can be scrubbed and played back on the live field map.
//  Nothing in here touches the DOM, so it runs under Node for tests too.
// ============================================================================
import { distanceKm } from './util.js';

const TIME_KEYS = ['t', 'time', 'timestamp', 'ts', 'sec', 'secs', 'second', 'seconds', 'elapsed', 'recorded_at', 'datetime'];
const LAT_KEYS = ['lat', 'latitude', 'y'];
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude', 'x'];

export const MAX_POINTS = 50000;

const clean = (s) => String(s ?? '').trim().replace(/^"(.*)"$/s, '$1').trim();
const isNum = (s) => s !== '' && Number.isFinite(Number(s));

function splitRow(line, delim) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out.map(clean);
}

function detectDelimiter(line) {
  return [',', ';', '\t', '|']
    .map((d) => ({ d, n: line.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;
}

/**
 * Read a time cell. Supports elapsed seconds, `HH:MM:SS`, and ISO timestamps.
 * @returns {{value: number, absolute: boolean} | null}
 */
function parseTime(raw) {
  const s = clean(raw);
  if (s === '') return null;
  if (isNum(s)) return { value: Number(s), absolute: false };

  const clock = s.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/);
  if (clock) {
    const [, a, b, c] = clock;
    const secs = c === undefined
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c);
    return { value: secs, absolute: false };
  }

  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return { value: ms / 1000, absolute: true };
  return null;
}

function indexOfKey(header, keys) {
  return header.findIndex((col) => keys.includes(col.toLowerCase().replace(/[\s_-]+/g, '')));
}

/**
 * Parse CSV text into ordered `{t, lat, lng}` points.
 * Rows that cannot be read are skipped and reported through `warnings`.
 * @throws {Error} when the text holds no usable coordinates.
 */
export function parseTrackCsv(text, { maxPoints = MAX_POINTS } = {}) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

  if (!lines.length) throw new Error('The file is empty.');

  const delim = detectDelimiter(lines[0]);
  const first = splitRow(lines[0], delim);
  const hasHeader = first.some((c) => c !== '' && !isNum(c));

  let tIdx; let latIdx; let lngIdx;
  if (hasHeader) {
    tIdx = indexOfKey(first, TIME_KEYS);
    latIdx = indexOfKey(first, LAT_KEYS);
    lngIdx = indexOfKey(first, LNG_KEYS);
    if (latIdx < 0 || lngIdx < 0) {
      throw new Error(`Could not find latitude/longitude columns. Found: ${first.join(', ')}`);
    }
  } else if (first.length >= 3) {
    [tIdx, latIdx, lngIdx] = [0, 1, 2];
  } else if (first.length === 2) {
    [tIdx, latIdx, lngIdx] = [-1, 0, 1];
  } else {
    throw new Error('Expected columns like "t,lat,lng".');
  }

  const warnings = [];
  const note = (msg) => { if (warnings.length < 5) warnings.push(msg); };
  if (tIdx < 0) note('No time column — points are spaced one second apart.');

  const rows = [];
  let absoluteTime = null;
  let skipped = 0;

  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    if (rows.length >= maxPoints) {
      note(`Only the first ${maxPoints.toLocaleString()} points were read.`);
      break;
    }
    const cells = splitRow(lines[i], delim);
    const lat = Number(clean(cells[latIdx]));
    const lng = Number(clean(cells[lngIdx]));

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      skipped++;
      note(`Line ${i + 1}: skipped — invalid coordinates.`);
      continue;
    }

    let t = rows.length;
    if (tIdx >= 0) {
      const parsed = parseTime(cells[tIdx]);
      if (!parsed) {
        skipped++;
        note(`Line ${i + 1}: skipped — unreadable time "${clean(cells[tIdx])}".`);
        continue;
      }
      if (absoluteTime === null) absoluteTime = parsed.absolute;
      t = parsed.value;
    }
    rows.push({ t, lat, lng });
  }

  if (!rows.length) throw new Error('No valid coordinates found in the file.');
  if (skipped > 5) warnings.push(`${skipped} rows skipped in total.`);

  rows.sort((a, b) => a.t - b.t);

  const base = rows[0].t;
  const points = [];
  for (const r of rows) {
    const t = r.t - base;
    // Equal timestamps would make interpolation divide by zero.
    if (points.length && t <= points[points.length - 1].t) continue;
    points.push({ t, lat: r.lat, lng: r.lng });
  }
  if (points.length < rows.length) note(`${rows.length - points.length} duplicate timestamps merged.`);

  return { points, warnings, absoluteTime: Boolean(absoluteTime) };
}

/** Initial bearing from a to b, in degrees clockwise from north. */
export function bearing(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Add per-point distance, speed and heading, plus track-level summary. */
export function buildTrack(points, { name = 'Track' } = {}) {
  if (!points?.length) throw new Error('A track needs at least one point.');

  const pts = points.map((p) => ({ ...p, distKm: 0, cumKm: 0, speed: 0, heading: 0 }));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dt = b.t - a.t;
    b.distKm = distanceKm(a, b);
    b.cumKm = a.cumKm + b.distKm;
    b.speed = dt > 0 ? (b.distKm / dt) * 3600 : 0;
    b.heading = bearing(a, b);
  }
  if (pts.length > 1) {
    pts[0].speed = pts[1].speed;
    pts[0].heading = pts[1].heading;
  }

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const duration = pts[pts.length - 1].t;
  const distanceTotal = pts[pts.length - 1].cumKm;

  return {
    name,
    points: pts,
    duration,
    distanceKm: distanceTotal,
    avgSpeed: duration > 0 ? (distanceTotal / duration) * 3600 : 0,
    maxSpeed: Math.max(0, ...pts.map((p) => p.speed)),
    bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
    latLngs: pts.map((p) => [p.lat, p.lng]),
  };
}

/** Parse CSV text straight into a playable track. */
export function trackFromCsv(text, { name, maxPoints } = {}) {
  const { points, warnings } = parseTrackCsv(text, { maxPoints });
  return { ...buildTrack(points, { name }), warnings };
}

/** Position along the track at elapsed time `t` (seconds), linearly interpolated. */
export function sampleAt(track, t) {
  const pts = track.points;
  const time = Math.min(Math.max(t, 0), track.duration);

  if (pts.length === 1) {
    const p = pts[0];
    return { lat: p.lat, lng: p.lng, speed: 0, heading: 0, time: 0, index: 0, cumKm: 0, progress: 1 };
  }

  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= time) lo = mid; else hi = mid;
  }

  const a = pts[lo];
  const b = pts[hi];
  const span = b.t - a.t;
  const f = span > 0 ? (time - a.t) / span : 0;

  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
    speed: b.speed,
    heading: b.heading,
    time,
    index: lo,
    cumKm: a.cumKm + b.distKm * f,
    progress: track.duration > 0 ? time / track.duration : 1,
  };
}

/** `93` -> `01:33` */
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const defaultRaf = (fn) => (typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(fn)
  : setTimeout(() => fn(defaultNow()), 16));
const defaultCancel = (id) => (typeof cancelAnimationFrame === 'function'
  ? cancelAnimationFrame(id)
  : clearTimeout(id));

/**
 * Drives a track forward in wall-clock time and reports interpolated positions.
 * `onFrame` receives the result of `sampleAt` plus the player's speed multiplier.
 */
export class TrackPlayer {
  constructor(track, { speed = 1, loop = false, onFrame, onEnd } = {}, clock = {}) {
    this.track = track;
    this.speed = speed;
    this.loop = loop;
    this.onFrame = onFrame;
    this.onEnd = onEnd;
    this.time = 0;
    this.playing = false;
    this._frame = null;
    this._last = 0;
    this._now = clock.now || defaultNow;
    this._raf = clock.raf || defaultRaf;
    this._cancel = clock.cancel || defaultCancel;
  }

  get finished() { return this.time >= this.track.duration; }

  emit() {
    this.onFrame?.(sampleAt(this.track, this.time), this);
  }

  play() {
    if (this.playing || this.track.duration <= 0) return;
    if (this.finished) this.time = 0;
    this.playing = true;
    this._last = this._now();
    const step = (stamp) => {
      if (!this.playing) return;
      const now = Number.isFinite(stamp) ? stamp : this._now();
      const dt = Math.max(0, (now - this._last) / 1000);
      this._last = now;
      this.time += dt * this.speed;

      if (this.time >= this.track.duration) {
        if (this.loop) {
          this.time %= this.track.duration;
        } else {
          this.time = this.track.duration;
          this.playing = false;
          this.emit();
          this.onEnd?.(this);
          return;
        }
      }
      this.emit();
      this._frame = this._raf(step);
    };
    this._frame = this._raf(step);
  }

  pause() {
    this.playing = false;
    if (this._frame != null) this._cancel(this._frame);
    this._frame = null;
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  seek(t) {
    this.time = Math.min(Math.max(t, 0), this.track.duration);
    this._last = this._now();
    this.emit();
  }

  setSpeed(multiplier) {
    this.speed = multiplier;
    this._last = this._now();
  }

  setLoop(on) { this.loop = Boolean(on); }

  destroy() {
    this.pause();
    this.onFrame = null;
    this.onEnd = null;
  }
}
