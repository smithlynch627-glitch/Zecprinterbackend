import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { rpc, sendError } from './supabase.js';
import { oauthHeader } from './oauth1.js';

const OAUTH_COOKIE = 'zp_oauth';
const ISSUER = 'zec-printer';
const X_API = 'https://api.x.com';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64url = (buf) => buf.toString('base64url');
const sha256hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const cookieOptions = {
  httpOnly: true,
  secure: config.secureCookies,
  sameSite: 'lax',
  signed: true,
  maxAge: 10 * 60 * 1000,
  path: '/auth',
};

const toSite = (res, query) => res.redirect(`${config.frontendUrl}/onboard?${query}`);

// Saves ONLY the X account id + username, then hands the website a one-time code (valid 2 minutes).
async function finishLogin(res, xId, username) {
  const userId = await rpc('api_upsert_x_user', { p_x_user_id: String(xId), p_username: username });
  const loginCode = b64url(crypto.randomBytes(32));
  await rpc('api_create_login_code', { p_user_id: userId, p_code_hash: sha256hex(loginCode) });
  return toSite(res, `login_code=${loginCode}`);
}

// =====================================================================================
// Mode oauth1 (default): "Log in with X". X puts user_id + screen_name in the login
// response itself, so there is NO profile read and NO API credit is used.
// =====================================================================================
async function xOauth1Post(path, { token, tokenSecret, oauthExtra }) {
  const url = `${X_API}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: oauthHeader({
        method: 'POST',
        url,
        consumerKey: config.xConsumerKey,
        consumerSecret: config.xConsumerSecret,
        token,
        tokenSecret,
        oauthExtra,
      }),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, data: new URLSearchParams(text) };
}

async function oauth1Login(req, res) {
  const r = await xOauth1Post('/oauth/request_token', { oauthExtra: { oauth_callback: config.xRedirectUri } });
  const token = r.data.get('oauth_token');
  const secret = r.data.get('oauth_token_secret');
  if (!r.ok || !token || !secret || r.data.get('oauth_callback_confirmed') !== 'true') {
    console.error('[auth] oauth1 request_token failed', r.status, r.text);
    return toSite(res, 'auth_error=x_setup');
  }
  res.cookie(OAUTH_COOKIE, JSON.stringify({ m: 'oauth1', t: token, s: secret }), cookieOptions);
  return res.redirect(`${X_API}/oauth/authenticate?oauth_token=${encodeURIComponent(token)}`);
}

async function oauth1Callback(req, res, saved, fail) {
  if (req.query.denied) return fail('denied');
  const { oauth_token: token, oauth_verifier: verifier } = req.query;
  if (typeof token !== 'string' || !safeEqual(token, saved.t)) return fail('state_mismatch');
  if (typeof verifier !== 'string' || !verifier || verifier.length > 200) return fail('missing_code');

  const r = await xOauth1Post('/oauth/access_token', {
    token,
    tokenSecret: saved.s,
    oauthExtra: { oauth_verifier: verifier },
  });
  const xId = r.data.get('user_id');
  const username = r.data.get('screen_name');
  if (!r.ok || !xId || !username) {
    console.error('[auth] oauth1 access_token failed', r.status, r.text);
    return fail('token_failed');
  }
  // The user's access token in this response is ignored and never stored.
  return finishLogin(res, xId, username);
}

// =====================================================================================
// Mode oauth2 (backup): standard OAuth 2.0. X doesn't return the username here, so it
// needs ONE paid read (GET /2/users/me, about $0.01 per login).
// =====================================================================================
const basicAuth = () => 'Basic ' + Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');

function oauth2Login(req, res) {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  res.cookie(OAUTH_COOKIE, JSON.stringify({ m: 'oauth2', state, verifier }), cookieOptions);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.xClientId,
    redirect_uri: config.xRedirectUri,
    scope: 'tweet.read users.read', // X requires both for /2/users/me
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return res.redirect(`https://x.com/i/oauth2/authorize?${params}`);
}

async function oauth2Callback(req, res, saved, fail) {
  if (req.query.error) return fail('denied');
  const { state, code } = req.query;
  if (typeof state !== 'string' || !safeEqual(state, saved.state)) return fail('state_mismatch');
  if (typeof code !== 'string' || code.length > 1000) return fail('missing_code');

  const tokenRes = await fetch(`${X_API}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.xRedirectUri,
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    console.error('[auth] oauth2 token exchange failed', tokenRes.status, await tokenRes.text());
    return fail('token_failed');
  }
  const { access_token: accessToken } = await tokenRes.json();

  // The one paid call: read the account id + username.
  const meRes = await fetch(`${X_API}/2/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const meBody = await meRes.json().catch(() => ({}));

  // Close the connection: revoke the token right away (never stored).
  fetch(`${X_API}/2/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' }),
  }).catch(() => {});

  const xId = meBody?.data?.id;
  const username = meBody?.data?.username;
  if (!meRes.ok || !xId || !username) {
    console.error('[auth] oauth2 users/me failed', meRes.status, JSON.stringify(meBody));
    return fail(meRes.status === 402 || meRes.status === 403 ? 'x_unavailable' : 'profile_failed');
  }
  return finishLogin(res, xId, username);
}

// =====================================================================================
// Routes
// =====================================================================================
export const authRouter = Router();

authRouter.get('/x/login', async (req, res) => {
  try {
    return config.xAuthMode === 'oauth2' ? oauth2Login(req, res) : await oauth1Login(req, res);
  } catch (err) {
    console.error('[auth] login error:', err?.message ?? err);
    return toSite(res, 'auth_error=server_error');
  }
});

authRouter.get('/x/callback', async (req, res) => {
  const fail = (reason) => toSite(res, `auth_error=${encodeURIComponent(reason)}`);
  const raw = req.signedCookies?.[OAUTH_COOKIE];
  res.clearCookie(OAUTH_COOKIE, { path: '/auth' });

  try {
    if (req.query.denied || req.query.error) return fail('denied');
    if (!raw) return fail('session_expired');
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      return fail('session_expired');
    }
    if (saved.m !== config.xAuthMode) return fail('session_expired'); // mode changed mid-login
    return config.xAuthMode === 'oauth2'
      ? await oauth2Callback(req, res, saved, fail)
      : await oauth1Callback(req, res, saved, fail);
  } catch (err) {
    console.error('[auth] callback error:', err?.message ?? err);
    return fail('server_error');
  }
});

// The website trades the one-time code for a session token.
authRouter.post('/exchange', async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(code)) {
    return res.status(400).json({ error: 'This login link is not valid. Connect X again.' });
  }
  try {
    const userId = await rpc('api_consume_login_code', { p_code_hash: sha256hex(code) });
    const token = jwt.sign({ sub: userId }, config.sessionSecret, {
      algorithm: 'HS256',
      expiresIn: `${config.sessionDays}d`,
      issuer: ISSUER,
    });
    return res.json({ token });
  } catch (err) {
    return sendError(res, err);
  }
});

// Protects /api routes: requires "Authorization: Bearer <token>".
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connect X to continue.' });
  try {
    const payload = jwt.verify(token, config.sessionSecret, { algorithms: ['HS256'], issuer: ISSUER });
    if (typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub)) throw new Error('bad subject');
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has ended. Connect X again.' });
  }
}
