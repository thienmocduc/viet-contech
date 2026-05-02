import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { env } from './env.js';
import { db, queryOne } from './lib/db.js';
import auth from './routes/auth.js';
import contact from './routes/contact.js';
import ai from './routes/ai.js';
import phongthuy from './routes/phongthuy.js';
import dashboard from './routes/dashboard.js';
import booking from './routes/booking.js';
import membership from './routes/membership.js';
import affiliate from './routes/affiliate.js';

const VERSION = '0.2.0';
const app = new Hono();

// ===== Global middleware =====
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return env.CORS_ORIGINS[0] ?? null;
      return env.CORS_ORIGINS.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

app.use('*', secureHeaders());

// Structured JSON logger middleware (replace hono/logger)
app.use('*', async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  await next();
  const duration = Date.now() - start;
  const status = c.res.status;
  const session = c.get('session');
  console.log(
    JSON.stringify({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      ts: new Date().toISOString(),
      route: `${method} ${path}`,
      status,
      duration,
      userId: session?.sub ?? null,
      mode: env.PROVIDER_MODE,
    })
  );
});

// ===== Health check =====
app.get('/healthz', (c) => {
  let tables = 0;
  try {
    // Best-effort count tables — agent main lib/db.ts should expose db.prepare
    const row = queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table'`,
      []
    );
    tables = row?.c ?? 0;
  } catch {
    /* ignore - DB might be Postgres or not yet ready */
  }
  return c.json({
    ok: true,
    service: 'viet-contech-backend',
    version: VERSION,
    env: env.NODE_ENV,
    mode: env.PROVIDER_MODE,
    db: { tables },
    ts: new Date().toISOString(),
  });
});

// ===== Routes =====
app.route('/api/auth', auth);
app.route('/api/contact', contact);
app.route('/api/ai', ai);
app.route('/api/phongthuy', phongthuy);
app.route('/api/dashboard', dashboard);
app.route('/api/booking', booking);
app.route('/api/membership', membership);
app.route('/api/affiliate', affiliate);

// 404
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// Error handler — never leak stack
app.onError((err, c) => {
  console.log(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled_error',
      path: c.req.path,
      method: c.req.method,
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    })
  );
  return c.json({ error: 'internal_error', message: 'Co loi xay ra, vui long thu lai' }, 500);
});

// ===== Start =====
const port = env.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'server.started',
      port: info.port,
      env: env.NODE_ENV,
      mode: env.PROVIDER_MODE,
      cors: env.CORS_ORIGINS,
      ts: new Date().toISOString(),
    })
  );
  console.log(`[BE] listening on :${info.port} mode=${env.PROVIDER_MODE}`);
});
