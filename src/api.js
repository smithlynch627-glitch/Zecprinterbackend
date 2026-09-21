import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './auth.js';
import { errorFor, rpc, sendError } from './supabase.js';
import { parseTweetUrl } from './tweet.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const apiRouter = Router();

// Per-user limit for actions that write data (runs after requireAuth, so req.userId exists)
const actionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => `user:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a minute and try again.' },
});

// ---------- Leaderboard (public, cached 30s so it can't be used to hammer the DB) ----------
let board = { at: 0, data: null, pending: null };


async function getBoard() {
  if (board.data && Date.now() - board.at < 30_000) return board.data;
  if (!board.pending) {
    board.pending = rpc('api_leaderboard', { p_limit: 1000 })
      .then((data) => {
        board = { at: Date.now(), data, pending: null };
        return data;
      })
      .catch((err) => {
        board.pending = null;
        throw err;
      });
  }
  return board.pending;
}

apiRouter.get('/leaderboard', async (req, res) => {
  try {
    const data = await getBoard();
    res.set('Cache-Control', 'public, max-age=15');
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

// ---------- Public WL status (registration open / closed), cached 30s ----------
let status = { at: 0, data: null };

apiRouter.get('/status', async (req, res) => {
  try {
    if (!status.data || Date.now() - status.at > 30_000) {
      status = { at: Date.now(), data: await rpc('api_public_status') };
    }
    res.set('Cache-Control', 'public, max-age=15');
    res.json(status.data);
  } catch (err) {
    sendError(res, err);
  }
});

// ---------- Logged-in user ----------
apiRouter.get('/me', requireAuth, async (req, res) => {
  try {
    res.json(await rpc('api_get_profile', { p_user_id: req.userId }));
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.get('/tasks', requireAuth, async (req, res) => {
  try {
    res.json(await rpc('api_get_tasks', { p_user_id: req.userId }));
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/tasks/:id/submit', requireAuth, actionLimiter, async (req, res) => {
  const taskId = req.params.id;
  if (!UUID_RE.test(taskId)) return res.status(400).json({ error: 'Unknown task.' });

  let tweetUrl = null;
  const raw = req.body?.tweet_url;
  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw !== 'string' || raw.length > 300) {
      const e = errorFor('INVALID_TWEET_URL');
      return res.status(e.status).json(e.body);
    }
    const parsed = parseTweetUrl(raw);
    if (!parsed) {
      const e = errorFor('INVALID_TWEET_URL');
      return res.status(e.status).json(e.body);
    }
    tweetUrl = parsed.url;
  }

  try {
    const data = await rpc('api_submit_task', {
      p_user_id: req.userId,
      p_task_id: taskId,
      p_tweet_url: tweetUrl,
    });
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/referral/apply', requireAuth, actionLimiter, async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Refer codes are 6 letters and numbers.', code: 'INVALID_REFERRAL_CODE' });
  }
  try {
    const data = await rpc('api_apply_referral', { p_user_id: req.userId, p_code: code });
    board.at = 0; // points changed instantly, refresh the leaderboard on next request
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});
