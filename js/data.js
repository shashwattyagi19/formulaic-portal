import { CONFIG, useDemo } from './config.js';
import * as Mock from './mock.js';
import { uid, todayISO } from './util.js';

let supabase = null;
const DEMO = useDemo();

async function getClient() {
  if (DEMO) return null;
  if (supabase) return supabase;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  return supabase;
}

export const isDemo = () => DEMO;

/** Prefer the serverless login route when it is actually mounted. */
async function signInViaApi(email, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) return undefined;
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || 'Sign in failed');
    currentProfile = payload.profile;
    if (DEMO && currentProfile?.id) localStorage.setItem(SESSION_KEY, currentProfile.id);
    return currentProfile;
  } catch (err) {
    if (err instanceof TypeError) return undefined;
    throw err;
  }
}

// --- Session (demo mode persists the chosen user) ---------------------------
const SESSION_KEY = 'formulaic-session';
let currentProfile = null;

// ============================================================================
//  AUTH
// ============================================================================
export const Auth = {
  async restore() {
    if (DEMO) {
      const id = localStorage.getItem(SESSION_KEY);
      if (!id) return null;
      currentProfile = Mock.db().profiles.find((p) => p.id === id) || null;
      return currentProfile;
    }
    const sb = await getClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    return Data.getProfile(session.user.id);
  },

  async signIn(email, password) {
    const viaApi = await signInViaApi(email, password);
    if (viaApi !== undefined) return viaApi;

    if (DEMO) {
      const p = Mock.db().profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!p) throw new Error('No account found for that email.');
      if (password !== Mock.DEMO_PASSWORD) throw new Error('Incorrect password. (Demo password: demo1234)');
      localStorage.setItem(SESSION_KEY, p.id);
      currentProfile = p;
      return p;
    }
    const sb = await getClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return Data.getProfile(data.user.id);
  },

  async signOut() {
    if (DEMO) { localStorage.removeItem(SESSION_KEY); currentProfile = null; return; }
    const sb = await getClient();
    await sb.auth.signOut();
    currentProfile = null;
  },

  current() { return currentProfile; },
};

// ============================================================================
//  DATA
// ============================================================================
export const Data = {
  // -- Profiles & branches --------------------------------------------------
  async getProfile(id) {
    if (DEMO) return Mock.db().profiles.find((p) => p.id === id) || null;
    const sb = await getClient();
    const { data } = await sb.from('profiles').select('*').eq('id', id).single();
    currentProfile = data;
    return data;
  },

  async getBranches() {
    if (DEMO) return [...Mock.db().branches];
    const sb = await getClient();
    const { data } = await sb.from('branches').select('*').order('name');
    return data || [];
  },

  async getProfiles() {
    if (DEMO) return [...Mock.db().profiles];
    const sb = await getClient();
    const { data } = await sb.from('profiles').select('*').order('full_name');
    return data || [];
  },

  // -- Live positions / tracking -------------------------------------------
  async getLivePositions() {
    if (DEMO) return { ...Mock.db().live_positions };
    const sb = await getClient();
    const { data } = await sb.from('live_positions').select('*');
    const out = {};
    (data || []).forEach((r) => { out[r.user_id] = r; });
    return out;
  },

  /** Subscribe to live position updates. Returns an unsubscribe fn. */
  subscribeLive(onUpdate) {
    if (DEMO) {
      Mock.startSimulation(CONFIG.LOCATION_PING_INTERVAL);
      Data.getLivePositions().then(onUpdate);
      const off = Mock.onSimTick((positions) => onUpdate(positions));
      return () => { off(); Mock.stopSimulation(); };
    }
    let channel;
    getClient().then((sb) => {
      channel = sb.channel('live-positions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_positions' },
          async () => onUpdate(await Data.getLivePositions()))
        .subscribe();
    });
    return () => { if (channel) channel.unsubscribe(); };
  },

  async pushLocation({ user_id, lat, lng, heading, speed, battery }) {
    if (DEMO) {
      Mock.db().live_positions[user_id] = { user_id, lat, lng, heading, speed, battery, updated_at: new Date().toISOString() };
      Mock.save();
      return;
    }
    const sb = await getClient();
    await sb.from('locations').insert({ user_id, lat, lng, heading, speed, battery });
  },

  // -- Attendance -----------------------------------------------------------
  async getAttendance({ date, userId } = {}) {
    if (DEMO) {
      let rows = Mock.db().attendance;
      if (date) rows = rows.filter((r) => r.work_date === date);
      if (userId) rows = rows.filter((r) => r.user_id === userId);
      return [...rows].sort((a, b) => (a.work_date < b.work_date ? 1 : -1));
    }
    const sb = await getClient();
    let q = sb.from('attendance').select('*').order('work_date', { ascending: false });
    if (date) q = q.eq('work_date', date);
    if (userId) q = q.eq('user_id', userId);
    return (await q).data || [];
  },

  async checkIn(userId, coords) {
    const rec = {
      user_id: userId, work_date: todayISO(), check_in: new Date().toISOString(),
      check_in_lat: coords?.lat, check_in_lng: coords?.lng, status: 'present',
    };
    if (DEMO) {
      const all = Mock.db().attendance;
      const existing = all.find((r) => r.user_id === userId && r.work_date === rec.work_date);
      if (existing) { Object.assign(existing, rec, { id: existing.id }); }
      else all.unshift({ id: uid(), ...rec });
      Mock.save();
      return;
    }
    const sb = await getClient();
    await sb.from('attendance').upsert(rec, { onConflict: 'user_id,work_date' });
  },

  async checkOut(userId, coords) {
    const stamp = { check_out: new Date().toISOString(), check_out_lat: coords?.lat, check_out_lng: coords?.lng };
    if (DEMO) {
      const r = Mock.db().attendance.find((x) => x.user_id === userId && x.work_date === todayISO());
      if (r) { Object.assign(r, stamp); Mock.save(); }
      return;
    }
    const sb = await getClient();
    await sb.from('attendance').update(stamp).eq('user_id', userId).eq('work_date', todayISO());
  },

  // -- Expenses -------------------------------------------------------------
  async getExpenses({ branchId } = {}) {
    if (DEMO) {
      let rows = Mock.db().expenses;
      if (branchId) rows = rows.filter((r) => r.branch_id === branchId);
      return [...rows].sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1));
    }
    const sb = await getClient();
    let q = sb.from('expenses').select('*').order('spent_on', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    return (await q).data || [];
  },

  async addExpense(rec) {
    if (DEMO) { Mock.db().expenses.unshift({ id: uid(), status: 'pending', ...rec }); Mock.save(); return; }
    const sb = await getClient();
    await sb.from('expenses').insert(rec);
  },

  async updateExpense(id, patch) {
    if (DEMO) {
      const r = Mock.db().expenses.find((x) => x.id === id);
      if (r) { Object.assign(r, patch); Mock.save(); }
      return;
    }
    const sb = await getClient();
    await sb.from('expenses').update(patch).eq('id', id);
  },

  // -- Site visits ----------------------------------------------------------
  async getSiteVisits({ branchId, engineerId } = {}) {
    if (DEMO) {
      let rows = Mock.db().site_visits;
      if (branchId) rows = rows.filter((r) => r.branch_id === branchId);
      if (engineerId) rows = rows.filter((r) => r.engineer_id === engineerId);
      return [...rows];
    }
    const sb = await getClient();
    let q = sb.from('site_visits').select('*').order('scheduled_at', { ascending: true });
    if (branchId) q = q.eq('branch_id', branchId);
    if (engineerId) q = q.eq('engineer_id', engineerId);
    return (await q).data || [];
  },

  async addSiteVisit(rec) {
    if (DEMO) { Mock.db().site_visits.unshift({ id: uid(), status: 'assigned', ...rec }); Mock.save(); return; }
    const sb = await getClient();
    await sb.from('site_visits').insert(rec);
  },

  async updateSiteVisit(id, patch) {
    if (DEMO) {
      const r = Mock.db().site_visits.find((x) => x.id === id);
      if (r) { Object.assign(r, patch); Mock.save(); }
      return;
    }
    const sb = await getClient();
    await sb.from('site_visits').update(patch).eq('id', id);
  },

  async getActivity() {
    if (DEMO) {
      return Mock.db().site_visits
        .filter((v) => v.status !== 'completed')
        .slice(0, 6)
        .map((v) => ({
          time: new Date(v.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `${Mock.nameByUserId(v.engineer_id)} — ${v.client_name} (${v.status.replace('_', ' ')})`,
        }));
    }
    return [];
  },

  async getWeeklyVisitCounts() {
    if (DEMO) {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      const now = new Date();
      Mock.db().site_visits.forEach((v) => {
        const d = new Date(v.scheduled_at);
        const diff = Math.floor((now - d) / 86400000);
        if (diff >= 0 && diff < 7) counts[6 - diff] += 1;
      });
      return counts;
    }
    return [0, 0, 0, 0, 0, 0, 0];
  },
};

export const resetDemo = Mock.resetDemo;
