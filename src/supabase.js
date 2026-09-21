import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Service-role client. It can ONLY call the public api_* functions:
// the tables themselves are locked away in the private "app" schema.
const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export class RpcError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new RpcError(error.message || 'RPC_ERROR');
  return data;
}

// Database error codes -> [HTTP status, message shown to the user]
const ERRORS = {
  USER_NOT_FOUND: [401, 'Your session has ended. Connect X again.'],
  USER_BANNED: [403, 'This account has been removed from the WL.'],
  WL_CLOSED: [409, 'WL registration is closed. Tasks and refer codes are paused.'],
  INVALID_LOGIN_CODE: [400, 'This login link has expired. Connect X again.'],
  TASK_NOT_AVAILABLE: [400, 'This task is not available right now.'],
  TASK_NOT_READY: [400, 'This task is not ready yet. Check back soon.'],
  TASK_EXPIRED: [400, 'This task has ended.'],
  INVALID_TWEET_URL: [400, 'Paste a post link like https://x.com/yourname/status/123456.'],
  TWEET_NOT_YOURS: [400, 'That post is from a different account. Submit a post from your connected X account.'],
  ALREADY_SUBMITTED: [409, 'You already submitted this task.'],
  DUPLICATE_SUBMISSION: [409, 'That post was already used for a task. Submit a different post.'],
  INVALID_REFERRAL_CODE: [400, 'That refer code does not exist. Check the code and try again.'],
  CANNOT_USE_OWN_CODE: [400, 'You cannot use your own refer code.'],
  REFERRAL_ALREADY_APPLIED: [409, 'You already applied a refer code.'],
  MUTUAL_REFERRAL_NOT_ALLOWED: [400, 'You referred this person, so you cannot use their code.'],
};

export function sendError(res, err) {
  const known = err instanceof RpcError ? ERRORS[err.code] : undefined;
  if (known) {
    return res.status(known[0]).json({ error: known[1], code: err.code });
  }
  console.error('[api] unexpected error:', err?.message ?? err);
  return res.status(500).json({ error: 'Something went wrong on our side. Try again in a moment.' });
}

export function errorFor(code) {
  const known = ERRORS[code];
  return { status: known?.[0] ?? 400, body: { error: known?.[1] ?? 'Invalid request.', code } };
}
