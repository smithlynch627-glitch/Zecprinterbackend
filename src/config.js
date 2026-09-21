import 'dotenv/config';

// X login mode:
//   oauth1 (default) = "Log in with X". X returns id + username during login. $0 per login.
//   oauth2           = backup. Needs one paid profile read per login (about $0.01).
const X_AUTH_MODE = (process.env.X_AUTH_MODE || 'oauth1').trim().toLowerCase();
if (!['oauth1', 'oauth2'].includes(X_AUTH_MODE)) {
  console.error('[config] X_AUTH_MODE must be oauth1 or oauth2.');
  process.exit(1);
}

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'X_REDIRECT_URI',
  'FRONTEND_URL',
  'SESSION_SECRET',
  ...(X_AUTH_MODE === 'oauth1' ? ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET'] : ['X_CLIENT_ID', 'X_CLIENT_SECRET']),
];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[config] Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('[config] SESSION_SECRET must be at least 32 characters long.');
  process.exit(1);
}

const frontendOrigins = process.env.FRONTEND_URL.split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== undefined ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 8080),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  xAuthMode: X_AUTH_MODE,
  xConsumerKey: process.env.X_CONSUMER_KEY,
  xConsumerSecret: process.env.X_CONSUMER_SECRET,
  xClientId: process.env.X_CLIENT_ID,
  xClientSecret: process.env.X_CLIENT_SECRET,
  xRedirectUri: process.env.X_REDIRECT_URI,
  frontendOrigins,
  frontendUrl: frontendOrigins[0],
  sessionSecret: process.env.SESSION_SECRET,
  sessionDays: num(process.env.SESSION_DAYS, 7),
  verifyJobMinutes: Math.max(1, num(process.env.VERIFY_JOB_MINUTES, 5)),
  secureCookies: process.env.X_REDIRECT_URI.startsWith('https://'),
  // This backend's own public address (used in WL share links). Defaults to the X_REDIRECT_URI host.
  publicUrl: (process.env.PUBLIC_URL || new URL(process.env.X_REDIRECT_URI).origin).replace(/\/+$/, ''),
};
