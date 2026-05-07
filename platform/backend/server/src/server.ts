/**
 * server.ts — Master API Server
 *
 * Hop nhat tat ca module Wave 1 thanh 1 server Hono duy nhat:
 *   - Auth (Email-OTP)
 *   - Projects + Pipeline lifecycle
 *   - Deliverables + Manifest + ZIP export
 *   - Dashboard KPI
 *   - SSE event stream
 *   - Mount: TCVN engine / Pipeline orchestrator / BOQ / BIM / MEP / QC / Render / Export
 *
 *   PORT default 8787. Healthz `/healthz`.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';

// Cau hinh + thanh phan loi
import { env, isProd } from './env.js';
import './lib/db.js'; // boot DB + migrations som nhat
import { auditMw } from './middleware/audit.js';
import { rateLimitMw } from './middleware/rate-limit.js';
import { optionalAuth } from './middleware/auth.js';

// Routes nha minh
import { createAuthRouter } from './routes/auth.js';
import { createProjectRouter } from './routes/projects.js';
import { createDeliverableRouter } from './routes/deliverables.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createEventRouter } from './routes/events.js';

// Mounts module ngoai
import { mountTCVNRoutes } from './mounts/tcvn.js';
import { mountPipelineRoutes } from './mounts/pipeline.js';
import { mountBOQRoutes } from './mounts/boq.js';
import { mountBIMRoutes } from './mounts/bim.js';
import { mountMEPRoutes } from './mounts/mep.js';
import { mountQCRoutes } from './mounts/qc.js';
import { mountRenderRoutes } from './mounts/render.js';
import { mountExportRoutes } from './mounts/export.js';

export function buildApp(): Hono {
  const app = new Hono();

  // Global middleware
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGINS.length === 0 ? '*' : env.CORS_ORIGINS,
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );
  if (!isProd()) app.use('*', logger());
  app.use('*', optionalAuth); // populate user neu co token (rate-limit per-user)
  app.use('*', rateLimitMw);
  app.use('*', auditMw);

  // Healthz
  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      service: 'vct-design-platform',
      version: '1.0.0',
      layers: 19,
      env: env.NODE_ENV,
      time: new Date().toISOString(),
    }),
  );

  // Self-introspection
  app.get('/api/info', (c) =>
    c.json({
      ok: true,
      modules: ['auth', 'projects', 'deliverables', 'dashboard', 'events', 'tcvn', 'pipeline', 'boq', 'bim', 'mep', 'qc', 'render', 'export'],
      providers: {
        smtp: Boolean(env.SMTP_HOST && env.SMTP_USER),
        zeni_l3: Boolean(env.ZENI_L3_API_KEY),
      },
    }),
  );

  // ----- Mount routers -----
  app.route('/api/auth', createAuthRouter());
  app.route('/api/projects', createProjectRouter());
  app.route('/api/deliverables', createDeliverableRouter());
  app.route('/api/dashboard', createDashboardRouter());
  app.route('/api/events', createEventRouter());

  mountTCVNRoutes(app);
  mountPipelineRoutes(app);
  mountBOQRoutes(app);
  mountBIMRoutes(app);
  mountMEPRoutes(app);
  mountQCRoutes(app);
  mountRenderRoutes(app);
  mountExportRoutes(app);

  // 404 + error handler
  app.notFound((c) => c.json({ ok: false, error: 'not_found', path: c.req.path }, 404));
  app.onError((err, c) => {
    // eslint-disable-next-line no-console
    console.error('[server] unhandled error:', err);
    return c.json({ ok: false, error: 'internal_error', message: err.message }, 500);
  });

  return app;
}

// ============================================================
// Entry
// ============================================================
function main(): void {
  const app = buildApp();
  serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      // eslint-disable-next-line no-console
      console.log(
        `[server] vct-design-platform v1.0.0 ready on http://localhost:${info.port} (${env.NODE_ENV})`,
      );
    },
  );
}

const isMain =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('server.ts') ||
  process.argv[1]?.endsWith('server.js');

if (isMain) main();
