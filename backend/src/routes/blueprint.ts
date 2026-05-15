import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, getSession } from '../lib/auth.js';
import { exec, queryOne, query } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { generateAiBlueprint, AI_VIEW_KINDS, KTS_VIEW_KINDS } from '../lib/blueprint.js';
import type { Blueprint, BlueprintAsset, DnaRecord } from '../types.js';

const blueprint = new Hono();

const generateSchema = z.object({
  dna_id: z.string().min(8),
});

/**
 * POST /api/blueprint/generate
 * Tao 1 bo ban ve moi tu DNA da locked.
 * AI sinh ~11 view (floor+elevation+3D). KTS finalize structural/MEP/section sau.
 */
blueprint.post('/generate', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', message: 'Thieu dna_id', issues: parsed.error.issues }, 400);
  }
  const dna = queryOne<DnaRecord>(
    `SELECT * FROM dna_records WHERE id = ? AND user_id = ? LIMIT 1`,
    [parsed.data.dna_id, session.sub]
  );
  if (!dna) return c.json({ error: 'dna_not_found' }, 404);
  if (dna.status !== 'locked') {
    return c.json({ error: 'dna_not_locked', message: 'DNA chua xac nhan, vui long chot truoc' }, 409);
  }

  const bpId = `VCT-BP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  exec(
    `INSERT INTO blueprints (id, user_id, dna_id, status, ai_total_views, created_at, updated_at)
     VALUES (?, ?, ?, 'generating', 0, ?, ?)`,
    [bpId, session.sub, dna.id, now, now]
  );

  // Async generate (fire and forget). FE poll /api/blueprint/:id de check status.
  generateAiBlueprint({ blueprint_id: bpId, dna }).catch((err) => {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'blueprint.generate_async_failed',
      bpId,
      error: err instanceof Error ? err.message : 'unknown',
    }));
    exec(`UPDATE blueprints SET status = 'failed', updated_at = ? WHERE id = ?`, [new Date().toISOString(), bpId]);
  });

  return c.json({
    ok: true,
    id: bpId,
    status: 'generating',
    expected_ai_views: 11,
    kts_views_pending: KTS_VIEW_KINDS,
    message: 'Dang sinh ban ve. Goi GET /api/blueprint/' + bpId + ' sau ~60s.',
  }, 202);
});

/**
 * GET /api/blueprint/:id — chi tiet 1 bo ban ve + tat ca asset
 */
blueprint.get('/:id', requireAuth, async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'bad_request', message: 'Thieu id' }, 400);
  const bp = queryOne<Blueprint>(
    `SELECT * FROM blueprints WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, session.sub]
  );
  if (!bp) return c.json({ error: 'not_found' }, 404);
  const assets = query<BlueprintAsset>(
    `SELECT * FROM blueprint_assets WHERE blueprint_id = ? ORDER BY created_at`,
    [id]
  );
  return c.json({
    blueprint: bp,
    assets,
    summary: {
      ai_total: assets.filter((a) => a.produced_by === 'ai').length,
      kts_total: assets.filter((a) => a.produced_by === 'kts').length,
      ai_expected: AI_VIEW_KINDS.length,
      kts_expected: KTS_VIEW_KINDS.length,
      ai_pct: Math.round((assets.filter((a) => a.produced_by === 'ai').length / AI_VIEW_KINDS.length) * 100),
      kts_pct: Math.round((assets.filter((a) => a.produced_by === 'kts').length / KTS_VIEW_KINDS.length) * 100),
    },
  });
});

/**
 * GET /api/blueprint — list bo ban ve cua user
 */
blueprint.get('/', requireAuth, async (c) => {
  const session = getSession(c);
  const rows = query<Blueprint>(
    `SELECT * FROM blueprints WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [session.sub]
  );
  return c.json({ items: rows });
});

/**
 * POST /api/blueprint/:id/kts-asset
 * KTS upload asset hoan thien (structural / MEP / BOQ).
 * Yeu cau role 'agent' va dang ky assigned_kts.
 */
const ktsAssetSchema = z.object({
  view_kind: z.enum([
    'structural_foundation', 'structural_columns',
    'mep_electrical', 'mep_plumbing', 'mep_hvac',
    'section_xx', 'section_yy',
    'boq_summary',
  ]),
  asset_url: z.string().url(),
  asset_type: z.enum(['image', 'pdf', 'dwg', 'rvt', 'json']),
  floor_level: z.coerce.number().int().optional(),
  notes: z.string().max(1000).optional(),
  signed_off: z.boolean().default(false),
});

blueprint.post('/:id/kts-asset', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role !== 'agent' && session.role !== 'admin') {
    return c.json({ error: 'forbidden', message: 'Chi KTS hoac admin upload duoc' }, 403);
  }
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'bad_request' }, 400);
  const bp = queryOne<Blueprint>(`SELECT * FROM blueprints WHERE id = ? LIMIT 1`, [id]);
  if (!bp) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json().catch(() => null);
  const parsed = ktsAssetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;
  const aid = uid('bpa');
  const now = new Date().toISOString();
  exec(
    `INSERT INTO blueprint_assets
      (id, blueprint_id, view_kind, floor_level, produced_by, asset_url, asset_type,
       refs_used_count, strength_used, verified_above_70, kts_notes, kts_signed_off, created_at)
     VALUES (?, ?, ?, ?, 'kts', ?, ?, 0, NULL, 0, ?, ?, ?)`,
    [
      aid, id, data.view_kind, data.floor_level ?? null,
      data.asset_url, data.asset_type,
      data.notes ?? null, data.signed_off ? 1 : 0, now,
    ]
  );

  // Neu day la file dau KTS upload -> assign + chuyen kts_review
  if (!bp.assigned_kts) {
    exec(
      `UPDATE blueprints SET assigned_kts = ?, status = 'kts_review', kts_review_at = ?, updated_at = ? WHERE id = ?`,
      [session.sub, now, now, id]
    );
  } else {
    exec(`UPDATE blueprints SET updated_at = ? WHERE id = ?`, [now, id]);
  }

  return c.json({ ok: true, asset_id: aid });
});

/**
 * POST /api/blueprint/:id/finalize
 * KTS ky duyet bundle cuoi cung, tao bundle_url (PDF zip).
 */
blueprint.post('/:id/finalize', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role !== 'agent' && session.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403);
  }
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'bad_request' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const bundleUrl = (body?.bundle_url as string) ?? null;

  const now = new Date().toISOString();
  exec(
    `UPDATE blueprints SET status = 'finalized', finalized_at = ?, bundle_url = ?, updated_at = ? WHERE id = ?`,
    [now, bundleUrl, now, id]
  );
  return c.json({ ok: true, id, status: 'finalized', bundle_url: bundleUrl });
});

export default blueprint;
