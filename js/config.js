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
