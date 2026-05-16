import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, maybeAuth, getSession } from '../lib/auth.js';
import { exec, queryOne, query } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { audit } from '../lib/audit.js';
import { logEvent } from '../lib/gamify.js';

const dna = new Hono();

const saveSchema = z.object({
  id: z.string().min(4).optional(),
  buildingType: z.string().min(2).max(40),
  ctx: z.record(z.unknown()),
  markdown: z.string().min(20).max(50_000),
  addendums: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
});

/**
 * POST /api/dna — Tao moi hoac update DNA (chi khi status='draft').
 * Body: { id?, buildingType, ctx, markdown, addendums?, locked? }
 * Neu locked=true va status='draft' -> chuyen sang 'locked' immutable.
 */
dna.post('/', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }
  const now = new Date().toISOString();
  const data = parsed.data;
  const existing = data.id
    ? queryOne<{ id: string; status: string; user_id: string }>(
        `SELECT id, status, user_id FROM dna_records WHERE id=? LIMIT 1`,
        [data.id]
      )
    : null;
  if (existing && existing.user_id !== session.sub) {
    return c.json({ error: 'forbidden', message: 'Khong co quyen voi DNA nay' }, 403);
  }
  if (existing && existing.status === 'locked') {
    return c.json(
      { error: 'locked', message: 'DNA da locked — chi co the them note bo sung' },
      409
    );
  }
  const id = existing?.id ?? data.id ?? `VCT-DNA-${Date.now().toString(36).toUpperCase()}`;
  const status = data.locked ? 'locked' : 'draft';
  const lockedAt = data.locked ? now : null;
  if (existing) {
    exec(
      `UPDATE dna_records SET building_type=?, ctx_json=?, markdown=?, addendums_json=?, status=?, locked_at=COALESCE(?, locked_at), updated_at=? WHERE id=?`,
      [
        data.buildingType,
        JSON.stringify(data.ctx),
        data.markdown,
        JSON.stringify(data.addendums ?? []),
        status,
        lockedAt,
        now,
        id,
      ]
    );
  } else {
    exec(
      `INSERT INTO dna_records (id, user_id, building_type, ctx_json, markdown, addendums_json, status, locked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.sub,
        data.buildingType,
        JSON.stringify(data.ctx),
        data.markdown,
        JSON.stringify(data.addendums ?? []),
        status,
        lockedAt,
        now,
        now,
      ]
    );
    logEvent(session.sub, 'first_dna', { dnaId: id });
  }
  if (data.locked) {
    logEvent(session.sub, 'dna_confirm', { dnaId: id });
    audit(c, 'dna.confirm', { type: 'dna', id }, { buildingType: data.buildingType });
  }
  return c.json({ ok: true, id, status }, existing ? 200 : 201);
});

/**
 * GET /api/dna — List DNA cua user dang dang nhap.
 */
dna.get('/', requireAuth, (c) => {
  const session = getSession(c);
  const rows = query<{
    id: string;
    building_type: string;
    status: string;
    locked_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, building_type, status, locked_at, created_at, updated_at
     FROM dna_records WHERE user_id=? ORDER BY created_at DESC LIMIT 50`,
    [session.sub]
  );
  return c.json({ ok: true, records: rows });
});

/**
 * GET /api/dna/:id — Chi tiet DNA + notes (chi owner xem).
 */
dna.get('/:id', requireAuth, (c) => {
  const session = getSession(c);
  const id = c.req.param('id') ?? '';
  if (!id) return c.json({ error: 'bad_request' }, 400);
  const row = queryOne<{
    id: string;
    user_id: string;
    building_type: string;
    ctx_json: string;
    markdown: string;
    addendums_json: string;
    status: string;
    locked_at: string | null;
    created_at: string;
    updated_at: string;
  }>(`SELECT * FROM dna_records WHERE id=? LIMIT 1`, [id]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.user_id !== session.sub) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const notes = query<{
    id: string;
    note: string;
    attached: string | null;
    created_at: string;
  }>(
    `SELECT id, note, attached, created_at FROM dna_notes WHERE dna_id=? ORDER BY created_at ASC`,
    [id]
  );
  return c.json({
    ok: true,
    dna: {
      id: row.id,
      buildingType: row.building_type,
      ctx: JSON.parse(row.ctx_json || '{}'),
      markdown: row.markdown,
      addendums: JSON.parse(row.addendums_json || '[]'),
      status: row.status,
      lockedAt: row.locked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    notes,
  });
});

/**
 * POST /api/dna/:id/note — Them note bo sung (cho phep ca khi DNA locked).
 * Body: { note, attached? }
 */
const noteSchema = z.object({ note: z.string().min(2).max(2000), attached: z.string().max(500).optional() });
dna.post('/:id/note', requireAuth, async (c) => {
  const session = getSession(c);
  const id = c.req.param('id') ?? '';
  if (!id) return c.json({ error: 'bad_request' }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  const row = queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM dna_records WHERE id=? LIMIT 1`,
    [id]
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.user_id !== session.sub) return c.json({ error: 'forbidden' }, 403);
  const noteId = uid('dnn');
  exec(
    `INSERT INTO dna_notes (id, dna_id, user_id, note, attached, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [noteId, id, session.sub, parsed.data.note, parsed.data.attached ?? null, new Date().toISOString()]
  );
  audit(c, 'dna.note_added', { type: 'dna', id }, { noteId });
  return c.json({ ok: true, noteId }, 201);
});

export default dna;
