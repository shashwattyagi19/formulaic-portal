// ============================================================================
//  Formulaic Portal — Runtime configuration
//
//  To connect a real Supabase project:
//    1. Create a project at https://supabase.com
//    2. Run supabase/schema.sql, supabase/policies.sql, supabase/seed.sql
//       in the SQL editor.
//    3. Paste your Project URL + anon public key below.
//    4. Set DEMO_MODE to false.
//
//  When DEMO_MODE is true (or credentials are left blank) the portal runs
//  entirely in the browser against simulated data stored in localStorage —
//  no backend required. This lets you explore every screen, including the
//  live engineer-tracking map with moving markers.
// ============================================================================

export const CONFIG = {
  SUPABASE_URL: '',          // e.g. 'https://xxxxxxxx.supabase.co'
  SUPABASE_ANON_KEY: '',     // your anon public key

  // Force demo mode regardless of credentials. The app also auto-falls back
  // to demo mode if the two values above are empty.
  DEMO_MODE: true,

  COMPANY_NAME: 'Formulaic Valuers',

  // How often field devices push a GPS ping (ms) and how often the demo
  // simulator nudges engineers along their routes.
  LOCATION_PING_INTERVAL: 5000,
};

export const isSupabaseConfigured = () =>
  Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const useDemo = () => CONFIG.DEMO_MODE || !isSupabaseConfigured();
