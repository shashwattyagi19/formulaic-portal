/**
 * Unit tests for the CSV track replay engine (js/replay.js).
 * Runs on plain Node — no browser, no dependencies.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseTrackCsv, buildTrack, trackFromCsv, sampleAt, bearing, formatClock, TrackPlayer,
} from '../js/replay.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readSample = (name) => readFileSync(path.join(ROOT, 'sample', name), 'utf8');

test('parses the t,lat,lng sample file', () => {
  const { points, warnings } = parseTrackCsv(readSample('gps.csv'));
  assert.equal(points.length, 6);
  assert.deepEqual(warnings, []);
  assert.deepEqual(points[0], { t: 0, lat: 28.4728, lng: 77.5089 });
  assert.equal(points[5].t, 15);
});

test('rebases time so the first point starts at zero', () => {
  const { points } = parseTrackCsv('t,lat,lng\n100,28.1,77.1\n130,28.2,77.2\n');
  assert.equal(points[0].t, 0);
  assert.equal(points[1].t, 30);
});

test('reads ISO timestamps and HH:MM:SS clocks', () => {
  const iso = parseTrackCsv('timestamp,latitude,longitude\n2026-01-01T10:00:00Z,19.1,72.8\n2026-01-01T10:00:30Z,19.2,72.9\n');
  assert.equal(iso.points[1].t, 30);

  const clock = parseTrackCsv('time,lat,lng\n00:00:10,19.1,72.8\n00:01:40,19.2,72.9\n');
  assert.equal(clock.points[1].t, 90);
});

test('accepts headerless rows, semicolons and aliased columns', () => {
  const headerless = parseTrackCsv('0,19.1,72.8\n5,19.2,72.9\n');
  assert.equal(headerless.points.length, 2);
  assert.equal(headerless.points[1].t, 5);

  const semi = parseTrackCsv('t;lat;lon\n0;19.1;72.8\n5;19.2;72.9\n');
  assert.equal(semi.points.length, 2);

  const latLngOnly = parseTrackCsv('19.1,72.8\n19.2,72.9\n');
  assert.deepEqual(latLngOnly.points.map((p) => p.t), [0, 1]);
  assert.match(latLngOnly.warnings[0], /one second apart/);
});

test('skips unusable rows and sorts out-of-order points', () => {
  const { points, warnings } = parseTrackCsv([
    't,lat,lng',
    '# a comment',
    '10,19.2,72.9',
    '0,19.1,72.8',
    '20,999,72.9',
    '30,19.3,not-a-number',
    '',
  ].join('\n'));
  assert.deepEqual(points.map((p) => p.t), [0, 10]);
  assert.equal(warnings.length, 2);
});

test('drops duplicate timestamps that would break interpolation', () => {
  const { points } = parseTrackCsv('t,lat,lng\n0,19.1,72.8\n0,19.15,72.85\n5,19.2,72.9\n');
  assert.deepEqual(points.map((p) => p.t), [0, 5]);
});

test('rejects files with no usable coordinates', () => {
  assert.throws(() => parseTrackCsv(''), /empty/i);
  assert.throws(() => parseTrackCsv('name,notes\nfoo,bar\n'), /latitude\/longitude/i);
  assert.throws(() => parseTrackCsv('t,lat,lng\n0,abc,def\n'), /No valid coordinates/i);
});

test('honours the maxPoints cap', () => {
  const rows = ['t,lat,lng', ...Array.from({ length: 50 }, (_, i) => `${i},19.${i},72.${i}`)];
  const { points, warnings } = parseTrackCsv(rows.join('\n'), { maxPoints: 10 });
  assert.equal(points.length, 10);
  assert.match(warnings.at(-1), /first 10 points/);
});

test('computes distance, speed and bearing', () => {
  // 0.001 degrees of latitude is ~111 m; covered in 10 s -> ~40 km/h.
  const track = buildTrack([{ t: 0, lat: 19, lng: 72.8 }, { t: 10, lat: 19.001, lng: 72.8 }]);
  assert.ok(Math.abs(track.distanceKm - 0.1112) < 0.002, `distance ${track.distanceKm}`);
  assert.ok(Math.abs(track.points[1].speed - 40) < 1, `speed ${track.points[1].speed}`);
  assert.ok(Math.abs(bearing({ lat: 19, lng: 72.8 }, { lat: 19.001, lng: 72.8 })) < 0.001, 'due north');
  assert.ok(Math.abs(bearing({ lat: 19, lng: 72.8 }, { lat: 19, lng: 72.801 }) - 90) < 0.01, 'due east');
  assert.deepEqual(track.bounds, [[19, 72.8], [19.001, 72.8]]);
});

test('interpolates between samples and clamps to the track ends', () => {
  const track = trackFromCsv(readSample('gps.csv'), { name: 'gps.csv' });
  assert.equal(track.duration, 15);

  const mid = sampleAt(track, 4.5);
  assert.ok(Math.abs(mid.lat - 28.47325) < 1e-6, `lat ${mid.lat}`);
  assert.ok(Math.abs(mid.lng - 77.50905) < 1e-6, `lng ${mid.lng}`);
  assert.equal(mid.index, 1);
  assert.ok(mid.progress > 0.29 && mid.progress < 0.31);

  assert.equal(sampleAt(track, -20).time, 0);
  assert.equal(sampleAt(track, 999).time, 15);
  assert.equal(sampleAt(track, 999).progress, 1);
});

test('handles a single-point track without dividing by zero', () => {
  const track = buildTrack([{ t: 0, lat: 19, lng: 72.8 }]);
  assert.equal(track.duration, 0);
  const s = sampleAt(track, 5);
  assert.equal(s.lat, 19);
  assert.equal(s.speed, 0);
});

test('formats clocks', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(93), '01:33');
  assert.equal(formatClock(1526), '25:26');
  assert.equal(formatClock(3661), '1:01:01');
});

/** Deterministic clock so playback can be tested without a browser. */
function fakeClock() {
  let now = 0;
  const queue = [];
  return {
    clock: {
      now: () => now,
      raf: (fn) => queue.push(fn),
      cancel: () => queue.splice(0, queue.length),
    },
    advance(ms) {
      now += ms;
      const due = queue.splice(0, queue.length);
      due.forEach((fn) => fn(now));
    },
  };
}

test('player advances in real time and stops at the end', () => {
  const track = trackFromCsv(readSample('gps.csv'));
  const { clock, advance } = fakeClock();
  const frames = [];
  let ended = false;
  const player = new TrackPlayer(track, {
    onFrame: (pos) => frames.push(pos),
    onEnd: () => { ended = true; },
  }, clock);

  player.play();
  advance(5000);
  assert.equal(player.playing, true);
  assert.ok(Math.abs(player.time - 5) < 1e-9, `time ${player.time}`);
  assert.ok(Math.abs(frames.at(-1).lat - 28.4733) < 1e-6);

  advance(20000);
  assert.equal(player.time, track.duration);
  assert.equal(player.playing, false);
  assert.equal(ended, true);
});

test('speed multiplier scales elapsed track time', () => {
  const track = trackFromCsv(readSample('gps.csv'));
  const { clock, advance } = fakeClock();
  const player = new TrackPlayer(track, { speed: 4 }, clock);
  player.play();
  advance(2000);
  assert.ok(Math.abs(player.time - 8) < 1e-9, `time ${player.time}`);
});

test('looping wraps back to the start', () => {
  const track = trackFromCsv(readSample('gps.csv'));
  const { clock, advance } = fakeClock();
  const player = new TrackPlayer(track, { loop: true }, clock);
  player.play();
  advance(17000);
  assert.equal(player.playing, true);
  assert.ok(Math.abs(player.time - 2) < 1e-9, `time ${player.time}`);
});

test('seek clamps, emits a frame, and pause stops the loop', () => {
  const track = trackFromCsv(readSample('gps.csv'));
  const { clock, advance } = fakeClock();
  const seen = [];
  const player = new TrackPlayer(track, { onFrame: (p) => seen.push(p.time) }, clock);

  player.seek(9);
  assert.equal(seen.at(-1), 9);
  player.seek(500);
  assert.equal(player.time, track.duration);

  player.seek(0);
  player.play();
  advance(1000);
  player.pause();
  const timeAtPause = player.time;
  advance(5000);
  assert.equal(player.time, timeAtPause);
  assert.equal(player.playing, false);
});

test('the bundled Mumbai sample is a realistic, playable track', () => {
  const track = trackFromCsv(readSample('gps-mumbai-field-run.csv'), { name: 'Mumbai field run' });
  assert.ok(track.points.length > 200, `points ${track.points.length}`);
  assert.ok(track.distanceKm > 9 && track.distanceKm < 12, `distance ${track.distanceKm}`);
  assert.ok(track.avgSpeed > 10 && track.avgSpeed < 40, `avg speed ${track.avgSpeed}`);
  track.points.forEach((p) => {
    assert.ok(p.lat > 18.9 && p.lat < 19.3, `lat ${p.lat}`);
    assert.ok(p.lng > 72.7 && p.lng < 73.0, `lng ${p.lng}`);
  });
});
