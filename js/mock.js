// ============================================================================
//  Demo backend — an in-browser stand-in for Supabase.
//
//  Provides realistic seed data persisted to localStorage and a live
//  simulation that nudges site engineers along city routes so the tracking
//  map behaves like Swiggy/Zomato delivery tracking out of the box.
// ============================================================================
import { uid, todayISO } from './util.js';

const KEY = 'formulaic-demo-db-v1';

const BRANCHES = [
  { id: 'b-mum', name: 'Mumbai HQ',    code: 'MUM', city: 'Mumbai',    state: 'Maharashtra', address: 'Bandra Kurla Complex', lat: 19.0670, lng: 72.8700, monthly_budget: 1200000 },
  { id: 'b-pun', name: 'Pune Branch',  code: 'PUN', city: 'Pune',      state: 'Maharashtra', address: 'Hinjewadi Phase 2',   lat: 18.5913, lng: 73.7389, monthly_budget: 800000 },
  { id: 'b-del', name: 'Delhi Branch', code: 'DEL', city: 'New Delhi', state: 'Delhi',       address: 'Connaught Place',     lat: 28.6315, lng: 77.2167, monthly_budget: 950000 },
];

// Demo users. Password for every account is "demo1234".
const PROFILES = [
  { id: 'u-md',   full_name: 'Aarav Mehta',     email: 'md@formulaic.in',        role: 'managing_director', branch_id: null,    phone: '+91 98200 11000', is_active: true },
  { id: 'u-bh1',  full_name: 'Priya Sharma',    email: 'head.mumbai@formulaic.in',role: 'branch_head',      branch_id: 'b-mum', phone: '+91 98200 22001', is_active: true },
  { id: 'u-bh2',  full_name: 'Rohit Deshpande', email: 'head.pune@formulaic.in', role: 'branch_head',       branch_id: 'b-pun', phone: '+91 98200 22002', is_active: true },
  { id: 'u-tm1',  full_name: 'Kavya Nair',      email: 'tech@formulaic.in',      role: 'technical_manager', branch_id: 'b-mum', phone: '+91 98200 33001', is_active: true },
  { id: 'u-se1',  full_name: 'Imran Qureshi',   email: 'imran@formulaic.in',     role: 'site_engineer',     branch_id: 'b-mum', phone: '+91 98200 44001', is_active: true },
  { id: 'u-se2',  full_name: 'Sneha Patil',     email: 'sneha@formulaic.in',     role: 'site_engineer',     branch_id: 'b-mum', phone: '+91 98200 44002', is_active: true },
  { id: 'u-se3',  full_name: 'Vikram Rao',      email: 'vikram@formulaic.in',    role: 'site_engineer',     branch_id: 'b-mum', phone: '+91 98200 44003', is_active: true },
  { id: 'u-se4',  full_name: 'Ananya Joshi',    email: 'ananya@formulaic.in',    role: 'site_engineer',     branch_id: 'b-pun', phone: '+91 98200 44004', is_active: true },
  { id: 'u-dr1',  full_name: 'Manish Gupta',    email: 'drafter@formulaic.in',   role: 'drafter',           branch_id: 'b-mum', phone: '+91 98200 55001', is_active: true },
  { id: 'u-op1',  full_name: 'Farah Khan',      email: 'operator@formulaic.in',  role: 'operator',          branch_id: 'b-mum', phone: '+91 98200 66001', is_active: true },
];

// Routes (sequences of lat/lng) that engineers travel along, Mumbai + Pune.
const ROUTES = {
  'u-se1': [ [19.0760,72.8777],[19.0820,72.8810],[19.0900,72.8650],[19.1000,72.8500],[19.1136,72.8260],[19.1000,72.8500],[19.0900,72.8650] ],
  'u-se2': [ [19.0176,72.8562],[18.9967,72.8300],[18.9750,72.8260],[18.9600,72.8350],[18.9750,72.8260],[18.9967,72.8300] ],
  'u-se3': [ [19.0330,72.8590],[19.0500,72.8400],[19.0670,72.8700],[19.0800,72.8900],[19.0670,72.8700],[19.0500,72.8400] ],
  'u-se4': [ [18.5913,73.7389],[18.6200,73.7700],[18.6500,73.8000],[18.7600,73.8400],[18.6500,73.8000],[18.6200,73.7700] ],
};

const EXPENSE_CATS = ['Travel', 'Fuel', 'Equipment', 'Salary', 'Office Rent', 'Site Survey', 'Utilities', 'Misc'];

function seed() {
  const now = Date.now();
  const day = 86400000;

  // Live positions: start each engineer at the head of their route.
  const live_positions = {};
  for (const [uidKey, route] of Object.entries(ROUTES)) {
    live_positions[uidKey] = {
      user_id: uidKey, lat: route[0][0], lng: route[0][1],
      heading: 0, speed: 18 + Math.random() * 22, battery: 60 + Math.floor(Math.random() * 40),
      updated_at: new Date(now - Math.random() * 60000).toISOString(),
      _seg: 0, _t: Math.random(), // simulator cursor
    };
  }

  // Attendance for the last 30 days for each employee.
  const attendance = [];
  for (const p of PROFILES) {
    for (let d = 0; d < 30; d++) {
      const date = new Date(now - d * day);
      if (date.getDay() === 0) continue; // skip Sundays
      const r = Math.random();
      let status = 'present';
      if (r > 0.94) status = 'absent';
      else if (r > 0.88) status = 'on_leave';
      else if (r > 0.82) status = 'late';
      const inH = status === 'late' ? 10 : 9;
      const ci = new Date(date); ci.setHours(inH, Math.floor(Math.random() * 50), 0, 0);
      const co = new Date(date); co.setHours(18, Math.floor(Math.random() * 50), 0, 0);
      attendance.push({
        id: uid(), user_id: p.id, work_date: date.toISOString().slice(0, 10),
        check_in: status === 'absent' || status === 'on_leave' ? null : ci.toISOString(),
        check_out: status === 'absent' || status === 'on_leave' ? null : (d === 0 ? null : co.toISOString()),
        status,
      });
    }
  }

  // Expenses across branches for the last 60 days.
  const expenses = [];
  const branchUsers = (bid) => PROFILES.filter((p) => p.branch_id === bid);
  for (const b of BRANCHES) {
    const n = 28 + Math.floor(Math.random() * 14);
    for (let i = 0; i < n; i++) {
      const cat = EXPENSE_CATS[Math.floor(Math.random() * EXPENSE_CATS.length)];
      const base = cat === 'Salary' ? 60000 : cat === 'Office Rent' ? 90000 : cat === 'Equipment' ? 25000 : 4000;
      const amt = Math.round((base * (0.5 + Math.random() * 1.6)) / 100) * 100;
      const us = branchUsers(b.id);
      const u = us[Math.floor(Math.random() * us.length)];
      const r = Math.random();
      const status = r > 0.7 ? 'approved' : r > 0.45 ? 'reimbursed' : r > 0.2 ? 'pending' : 'rejected';
      expenses.push({
        id: uid(), branch_id: b.id, user_id: u?.id || null, category: cat,
        description: `${cat} — ${b.city}`, amount: amt,
        spent_on: new Date(now - Math.floor(Math.random() * 58) * day).toISOString().slice(0, 10),
        status,
      });
    }
  }

  // Site visits.
  const site_visits = [
    { id: uid(), branch_id: 'b-mum', engineer_id: 'u-se1', client_name: 'HDFC Bank',      property_type: 'commercial',  address: 'Lower Parel, Mumbai',  lat: 18.9967, lng: 72.8300, status: 'on_site',   scheduled_at: new Date(now).toISOString(), estimated_value: 45000000 },
    { id: uid(), branch_id: 'b-mum', engineer_id: 'u-se2', client_name: 'Patel Estates',  property_type: 'residential', address: 'Andheri West, Mumbai', lat: 19.1360, lng: 72.8260, status: 'en_route',  scheduled_at: new Date(now).toISOString(), estimated_value: 12000000 },
    { id: uid(), branch_id: 'b-mum', engineer_id: 'u-se3', client_name: 'ICICI Home Loans',property_type: 'residential',address: 'Dadar, Mumbai',        lat: 19.0180, lng: 72.8440, status: 'assigned',  scheduled_at: new Date(now + day).toISOString(), estimated_value: 8500000 },
    { id: uid(), branch_id: 'b-pun', engineer_id: 'u-se4', client_name: 'Kohinoor Group', property_type: 'industrial',  address: 'Chakan MIDC, Pune',    lat: 18.7600, lng: 73.8400, status: 'en_route',  scheduled_at: new Date(now).toISOString(), estimated_value: 78000000 },
    { id: uid(), branch_id: 'b-mum', engineer_id: 'u-se1', client_name: 'Axis Bank',      property_type: 'commercial',  address: 'BKC, Mumbai',          lat: 19.0670, lng: 72.8700, status: 'completed', scheduled_at: new Date(now - day).toISOString(), completed_at: new Date(now - day + 5e6).toISOString(), estimated_value: 33000000 },
    { id: uid(), branch_id: 'b-pun', engineer_id: null,    client_name: 'Magarpatta Devs',property_type: 'land',        address: 'Hadapsar, Pune',       lat: 18.5089, lng: 73.9260, status: 'assigned',  scheduled_at: new Date(now + 2 * day).toISOString(), estimated_value: 21000000 },
  ];

  return { branches: BRANCHES, profiles: PROFILES, live_positions, attendance, expenses, site_visits, routes: ROUTES };
}

// --- Persistence ------------------------------------------------------------
let DB = null;
export function db() {
  if (DB) return DB;
  try {
    const raw = localStorage.getItem(KEY);
    DB = raw ? JSON.parse(raw) : seed();
  } catch { DB = seed(); }
  DB.routes = ROUTES; // routes are code, never persisted state
  return DB;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch { /* ignore quota */ }
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  DB = null;
}

export const DEMO_PASSWORD = 'demo1234';

// --- Live movement simulator ------------------------------------------------
//  Linearly interpolates each engineer between route waypoints. Called on a
//  timer by the data layer; emits to subscribers so the map updates live.
let simTimer = null;
const simListeners = new Set();

export function onSimTick(fn) { simListeners.add(fn); return () => simListeners.delete(fn); }

export function startSimulation(intervalMs = 5000) {
  if (simTimer) return;
  const data = db();
  simTimer = setInterval(() => {
    for (const [u, route] of Object.entries(data.routes)) {
      const p = data.live_positions[u];
      if (!p) continue;
      p._seg = p._seg ?? 0;
      p._t = (p._t ?? 0) + 0.12 + Math.random() * 0.05;
      if (p._t >= 1) { p._t = 0; p._seg = (p._seg + 1) % route.length; }
      const a = route[p._seg];
      const b = route[(p._seg + 1) % route.length];
      const lat = a[0] + (b[0] - a[0]) * p._t;
      const lng = a[1] + (b[1] - a[1]) * p._t;
      p.heading = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      p.lat = lat; p.lng = lng;
      p.speed = 12 + Math.random() * 30;
      p.battery = Math.max(8, (p.battery ?? 80) - (Math.random() < 0.1 ? 1 : 0));
      p.updated_at = new Date().toISOString();
    }
    save();
    simListeners.forEach((fn) => fn(data.live_positions));
  }, intervalMs);
}
export function stopSimulation() { clearInterval(simTimer); simTimer = null; }
