/**
 * POST /api/auth/login
 *
 * Vercel / Next-style route handler. In production this talks to Supabase Auth;
 * when Supabase env vars are missing it authenticates against the same demo
 * accounts the portal uses in the browser.
 */
import { DEMO_PASSWORD, DEMO_PROFILES } from '../../js/mock.js';

export const runtime = 'nodejs';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

function publicProfile(p) {
  return {
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
    branch_id: p.branch_id ?? null,
    phone: p.phone ?? null,
    is_active: p.is_active !== false,
  };
}

async function signInDemo(email, password) {
  const profile = DEMO_PROFILES.find((p) => p.email.toLowerCase() === email.toLowerCase());
  if (!profile) return { ok: false, status: 401, error: 'No account found for that email.' };
  if (password !== DEMO_PASSWORD) {
    return { ok: false, status: 401, error: 'Incorrect password. (Demo password: demo1234)' };
  }
  return { ok: true, profile: publicProfile(profile), session: null };
}

async function signInWithSupabase(email, password, { url, key }) {
  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) {
    return {
      ok: false,
      status: 401,
      error: token.error_description || token.msg || token.error || 'Sign in failed',
    };
  }

  const userId = token.user?.id;
  let profile = null;
  if (userId) {
    const profileRes = await fetch(
      `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${token.access_token || key}`,
        },
      },
    );
    if (profileRes.ok) {
      const rows = await profileRes.json();
      profile = rows?.[0] ? publicProfile(rows[0]) : null;
    }
  }

  if (!profile) {
    profile = publicProfile({
      id: userId,
      full_name: token.user?.user_metadata?.full_name || email.split('@')[0],
      email: token.user?.email || email,
      role: 'operator',
    });
  }

  return {
    ok: true,
    profile,
    session: {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in,
      token_type: token.token_type || 'bearer',
    },
  };
}

export async function authenticate(email, password) {
  const supabase = supabaseConfig();
  if (supabase) return signInWithSupabase(email, password, supabase);
  return signInDemo(email, password);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? '').trim();
    const password = String(body?.password ?? '');

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const result = await authenticate(email, password);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ profile: result.profile, session: result.session });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
