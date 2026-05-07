/**
 * mounts/pipeline.ts — mount /api/pipeline/* (lazy-load pipeline orchestrator).
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import { loadExternal } from '../lib/external-loader.js';
import { publishPipelineEvent } from '../lib/event-bus.js';

interface OrchestratorCtor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (config?: Record<string, unknown>): any;
}
interface OrchestratorMod {
  PipelineOrchestrator: OrchestratorCtor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let orchestrator: any | null = null;
let loading: Promise<void> | null = null;
async function ensureOrchestrator(): Promise<void> {
  if (orchestrator) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const mod = await loadExternal<OrchestratorMod>('pipeline/src/orchestrator.js');
      orchestrator = new mod.PipelineOrchestrator();
      orchestrator.on('pipeline_event', (ev: Record<string, unknown>) => {
        publishPipelineEvent({
          type: String(ev.type ?? 'pipeline'),
          project_id: ev.project_id ? String(ev.project_id) : undefined,
          phase: ev.phase as string | number | undefined,
          agent: ev.agent as string | undefined,
          message: ev.message as string | undefined,
          payload: ev.payload,
        });
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[pipeline] orchestrator load failed:', (e as Error).message);
    }
  })();
  return loading;
}

const RunSchema = z.object({
  project_id: z.string().min(1),
  brief: z.record(z.unknown()),
});

const PhaseSchema = z.object({
  project_id: z.string().min(1),
  phase: z.string().min(1),
});

export function mountPipelineRoutes(app: Hono): void {
  app.get('/api/pipeline/health', async (c) => {
    await ensureOrchestrator();
    return c.json({
      ok: true,
      service: 'pipeline-orchestrator',
      mode: process.env.PROVIDER_MODE ?? 'mock',
      ready: !!orchestrator,
    });
  });

  app.post('/api/pipeline/run', async (c) => {
    await ensureOrchestrator();
    if (!orchestrator) return c.json({ ok: false, error: 'orchestrator_unavailable' }, 503);
    const body = await c.req.json().catch(() => null);
    const parsed = RunSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'invalid_input' }, 400);
    try {
      const res = await orchestrator.runMission(parsed.data.project_id, parsed.data.brief);
      return c.json({ ok: true, result: res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 500);
    }
  });

  app.post('/api/pipeline/phase', async (c) => {
    await ensureOrchestrator();
    if (!orchestrator) return c.json({ ok: false, error: 'orchestrator_unavailable' }, 503);
    const body = await c.req.json().catch(() => null);
    const parsed = PhaseSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'invalid_input' }, 400);
    try {
      const res = await orchestrator.runPhase(parsed.data.project_id, parsed.data.phase);
      return c.json({ ok: true, result: res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 400);
    }
  });

  app.get('/api/pipeline/state/:id', (c) => {
    const id = c.req.param('id');
    return c.json({
      ok: true,
      project_id: id,
      message: 'use SSE /api/events/stream/:id for live state',
    });
  });
}
