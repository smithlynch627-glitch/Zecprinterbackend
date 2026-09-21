import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { authRouter } from './auth.js';
import { apiRouter } from './api.js';
import { startVerificationJob } from './jobs.js';

const app = express();

app.set('trust proxy', 1); // Railway sits behind one proxy: needed for real IPs + secure cookies
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser(config.sessionSecret));

// General limit per IP
app.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down and try again shortly.' },
  }),
);

// Only your website may call the API from a browser
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.frontendOrigins.includes(origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

app.get('/', (req, res) => res.json({ name: 'ZEC PRINTER API', ok: true }));
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/auth', authLimiter, authRouter);
app.use('/api', apiRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error('[server] unhandled error:', err?.message ?? err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

app.listen(config.port, () => {
  console.log(`[server] ZEC PRINTER API running on port ${config.port} (X login mode: ${config.xAuthMode})`);
  startVerificationJob();
});
