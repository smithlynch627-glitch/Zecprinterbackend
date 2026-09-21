// LOCAL TESTING ONLY: log in to the website as a test user, without X.
//
//   node scripts/dev-login.js test_alice
//
// Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env, creates (or reuses) the
// test user, and prints a one-time login link for your local website (valid 2 minutes).
// Test users get X ids starting with 0 (real X ids never do), so they are easy to remove:
//   delete from app.users where x_user_id like '0%';
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const username = process.argv[2];
if (!username || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
  console.error('Usage: node scripts/dev-login.js <username>   (letters, numbers, _ ; up to 15 characters)');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.');
  process.exit(1);
}

// Always log in on the LOCAL website, never the live one.
const site =
  (FRONTEND_URL || '')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .find((u) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) || 'http://localhost:5173';

const sha256hex = (v) => crypto.createHash('sha256').update(v).digest('hex');
// Same username -> same fake X id, so running this again logs in as the same test user.
const fakeXId = '0' + (BigInt('0x' + sha256hex(username.toLowerCase()).slice(0, 15)) % 10n ** 15n).toString().padStart(15, '0');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

try {
  const userId = await rpc('api_upsert_x_user', { p_x_user_id: fakeXId, p_username: username });
  const code = crypto.randomBytes(32).toString('base64url');
  await rpc('api_create_login_code', { p_user_id: userId, p_code_hash: sha256hex(code) });
  console.log(`\nTest user @${username} is ready. Open this link within 2 minutes:\n\n  ${site}/onboard?login_code=${code}\n`);
  console.log('Tip: use a private/incognito window for a second test user at the same time.\n');
} catch (err) {
  console.error(`\nCould not create the test login: ${err.message}`);
  console.error('Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env, and that the SQL file was run.\n');
  process.exit(1);
}
