import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './db.js';
import { makeApiRouter } from './routes.js';
import { migrate } from './migrate.js';
import { startJournalCron } from './journalCron.js';
import { startHousekeepingCron } from './housekeepingCron.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const app = express();

// --- Multi-user session isolation + active user counter (in-memory, 10 minutes) ---
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const activeSessions = new Map(); // sid -> lastSeenMs

function cleanupActiveSessions(now = Date.now()) {
  for (const [sid, ts] of activeSessions.entries()) {
    if ((now - ts) > ACTIVE_WINDOW_MS) activeSessions.delete(sid);
  }
}

// CORS hardening: in production, set CORS_ORIGIN to your domain (comma-separated allowed origins)
const corsOriginEnv = String(process.env.CORS_ORIGIN || '').trim();
let corsOptions = undefined;
if (corsOriginEnv) {
  const allowed = corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean);
  corsOptions = {
    origin: function(origin, cb) {
      // allow same-origin / server-to-server / no-origin requests
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS_NOT_ALLOWED'), false);
    },
    credentials: false,
  };
}
app.use(cors(corsOptions));

// Cookie-based session (MemoryStore). No login UI; per-user isolation for temporary analysis data.
app.use(session({
  name: 'msar.sid',
  secret: String(process.env.SESSION_SECRET || 'msar_dev_secret'),
  resave: false,
  saveUninitialized: true,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2
  }
}));

// Track active sessions (last 10 minutes)
app.use((req, _res, next) => {
  try {
    const sid = req.sessionID;
    if (sid) {
      const now = Date.now();
      activeSessions.set(sid, now);
      cleanupActiveSessions(now);
      // Ensure per-session scratch space exists
      req.session.msar = req.session.msar || { last: null, cache: {} };
    }
  } catch (_) {}
  next();
});
app.use(express.json({ limit: '1mb' }));

let pool;
try {
  pool = getPool();
  // quick connection test
  await pool.query('SELECT 1 as ok');
  console.log('✅ Connected to Postgres');

  // Apply schema (safe & idempotent). Disable with AUTO_MIGRATE=false
  if (String(process.env.AUTO_MIGRATE ?? 'true').toLowerCase() !== 'false') {
    await migrate(pool);
    console.log('✅ Schema ensured');
  }
} catch (e) {
  console.error('⚠️ Postgres not connected yet:', e.message);
  // Keep server running so frontend can show a clear message.
}


// Active users endpoint (in-memory only)
app.get('/api/active-users', (req, res) => {
  cleanupActiveSessions();
  res.json({ ok: true, activeUsers: activeSessions.size, windowMinutes: 10 });
});

// Health endpoint (always available)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'MARKET_SENTINEL_AR', version: '3.12.4' });
});

app.use('/api', (req, res, next) => {
  // Allow health + active-users even when DB is not ready
  if (req.path === '/health' || req.path === '/active-users') return next();
  if (!pool) {
    return res.status(500).json({ ok: false, error: 'DB_NOT_READY', message: 'DATABASE_URL missing or DB connection failed.' });
  }
  next();
});

if (pool) {
  app.use('/api', makeApiRouter(pool));
}

// Serve frontend
app.use(express.static(PUBLIC_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 MARKET_SENTINEL_AR running on http://localhost:${PORT}`);
});
