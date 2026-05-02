import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { env } from './env.js';
import auth from './routes/auth.js';
import contact from './routes/contact.js';
import ai from './routes/ai.js';
import phongthuy from './routes/phongthuy.js';
import dashboard from './routes/dashboard.js';
import booking from './routes/booking.js';
import membership from './routes/membership.js';

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

// Hono logger -> stdout (dev only). O production duoc thay bang structured json log o moi handler.
if (env.NODE_ENV === 'development') {
  app.use('*', logger());
}

// ===== Health check (Cloud Run readiness/liveness) =====
app.get('/healthz', (c) =>
  c.json({
    ok: true,
    service: 'viet-contech-backend',
    env: env.NODE_ENV,
    ts: new Date().toISOString(),
  })
);

// ===== Routes =====
app.route('/api/auth', auth);
app.route('/api/contact', contact);
app.route('/api/ai', ai);
app.route('/api/phongthuy', phongthuy);
app.route('/api/dashboard', dashboard);
app.route('/api/booking', booking);
app.route('/api/membership', membership);

// 404
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// Error handler
app.onError((err, c) => {
  console.log(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled_error',
      path: c.req.path,
      method: c.req.method,
      error: err.message,
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
      cors: env.CORS_ORIGINS,
      ts: new Date().toISOString(),
    })
  );
});
