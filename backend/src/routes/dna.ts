import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, getSession } from '../lib/auth.js';
import { db, queryOne, exec, query } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { calcCung } from '../lib/phongthuy.js';
import type { DnaRecord, Gender, SpaceType } from '../types.js';

const dna = new Hono();

// =====================================================
// Schema cho DNA day du 8 muc (parsed tu chat KTS)
// =====================================================
const dnaJsonSchema = z.object({
  // 1. Thong tin gia chu
  owner: z.object({
    name: z.string().min(2).max(100),
    year_born: z.coerce.number().int().min(1900).max(2100),
    spouse_year_born: z.coerce.number().int().min(1900).max(2100).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
  }),
  // 2. Lot dat
  land: z.object({
    area_m2: z.coerce.number().positive(),
    frontage_m: z.coerce.number().positive().optional(),
    depth_m: z.coerce.number().positive().optional(),
    direction: z.string().optional(),                        // huong dat
    floors: z.coerce.number().int().min(1).max(20),
    is_corner: z.boolean().optional(),
  }),
  // 3. Dia chi du an
  project_address: z.object({
    province: z.string(),
    district: z.string().optional(),
    street: z.string().optional(),
  }).optional(),
  // 4. Muc dich + gia dinh
  purpose: z.object({
    type: z.enum(['o', 'kinh_doanh', 'hon_hop']),
    family_members: z.coerce.number().int().min(1),
    rooms_required: z.array(z.string()).optional(),         // ['phong ngu','master','khach','bep','tho','lam viec','gym']
    lifestyle_notes: z.string().optional(),
  }),
  // 5. Phong cach
  style: z.object({
    primary: z.enum(['Indochine','Luxury','Modern','Japandi','Tropical','Wabi-sabi','Scandinavian']),
    secondary: z.string().optional(),
  }),
  // 6. Phong thuy
  fengshui: z.object({
    gender: z.enum(['nam','nu']),
    door_direction: z.string().optional(),
    year_build: z.coerce.number().int().optional(),
  }),
  // 7. Ngan sach + timeline
  budget: z.object({
    design_vnd: z.coerce.number().optional(),
    construction_vnd: z.coerce.number().optional(),
    interior_vnd: z.coerce.number().optional(),
    total_vnd: z.coerce.number().optional(),
    deadline: z.string().optional(),
  }),
  // 8. Dac biet
  special: z.object({
    fengshui_taboos: z.array(z.string()).optional(),
    material_allergies: z.array(z.string()).optional(),
  }).optional(),
});

const dnaSubmitSchema = z.object({
  dna: dnaJsonSchema,
  markdown: z.string().min(50, 'DNA markdown qua ngan'),
  completeness: z.coerce.number().min(0).max(1),
});

function inferSpaceType(dna: z.infer<typeof dnaJsonSchema>): SpaceType {
  const area = dna.land.area_m2 ?? 0;
  const frontage = dna.land.frontage_m ?? 0;
  const isLuxury = (dna.budget.total_vnd ?? 0) >= 30_000_000_000;
  if (area >= 300 && frontage >= 10) return isLuxury ? 'biet_thu_luxury' : 'biet_thu_nha_vuon';
  if (area >= 80 && frontage <= 8 && (dna.land.floors ?? 1) >= 3) return 'nha_pho';
  if (dna.purpose.type === 'kinh_doanh') return 'office_luxury';
  return 'kien_truc_khac';
}

/**
 * POST /api/dna — luu DNA (status: draft). FE goi sau khi parseFullDNA tren chat.
 */
dna.post('/', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = dnaSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', message: 'DNA thieu hoac sai format', issues: parsed.error.issues }, 400);
  }
  const { dna: dnaObj, markdown, completeness } = parsed.data;
  const cung = calcCung(dnaObj.owner.year_born, dnaObj.fengshui.gender);
  const id = `VCT-DNA-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const spaceType = inferSpaceType(dnaObj);

  exec(
    `INSERT INTO dna_records (id, user_id, dna_json, dna_markdown,
       area_m2, floors, bedrooms, space_type, style, year_born, gender,
       cung_menh, ngu_hanh, budget_vnd, completeness, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [
      id, session.sub, JSON.stringify(dnaObj), markdown,
      dnaObj.land.area_m2, dnaObj.land.floors,
      (dnaObj.purpose.rooms_required ?? []).filter((r: string) => /ngu/i.test(r)).length,
      spaceType, dnaObj.style.primary, dnaObj.owner.year_born, dnaObj.fengshui.gender,
      cung.cung, cung.nguHanh, dnaObj.budget.total_vnd ?? null,
      completeness, now, now,
    ]
  );
  return c.json({ ok: true, id, status: 'draft', space_type: spaceType, cung_menh: cung.cung, ngu_hanh: cung.nguHanh }, 201);
});

/**
 * POST /api/dna/:id/confirm — gia chu xac nhan DNA, lock immutable
 */
dna.post('/:id/confirm', requireAuth, async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'bad_request', message: 'Thieu id' }, 400);
  const row = queryOne<DnaRecord>(`SELECT * FROM dna_records WHERE id = ? AND user_id = ? LIMIT 1`, [id, session.sub]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  if (row.status === 'locked') return c.json({ error: 'already_locked', message: 'DNA da lock, khong sua duoc' }, 409);
  const now = new Date().toISOString();
  exec(`UPDATE dna_records SET status = 'locked', confirmed_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  return c.json({ ok: true, id, status: 'locked', confirmed_at: now });
});

/**
 * GET /api/dna — list DNA cua user (de mydesigns/cusDNA hien thi)
 */
dna.get('/', requireAuth, async (c) => {
  const session = getSession(c);
  const rows = query<DnaRecord>(
    `SELECT id, status, space_type, style, area_m2, floors, completeness, confirmed_at, created_at
     FROM dna_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [session.sub]
  );
  return c.json({ items: rows });
});

/**
 * GET /api/dna/:id — chi tiet DNA (cho design dispatch)
 */
dna.get('/:id', requireAuth, async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'bad_request', message: 'Thieu id' }, 400);
  const row = queryOne<DnaRecord>(`SELECT * FROM dna_records WHERE id = ? AND user_id = ? LIMIT 1`, [id, session.sub]);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({
    ...row,
    dna: JSON.parse(row.dna_json),
  });
});

export default dna;
