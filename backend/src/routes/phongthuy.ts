import { Hono } from 'hono';
import { z } from 'zod';
import { exec } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { maybeAuth, getOptionalSession } from '../lib/auth.js';
import { calcCung } from '../lib/phongthuy.js';

const phongthuy = new Hono();

const logSchema = z.object({
  yearBorn: z.coerce.number().int().min(1900).max(2100),
  gender: z.enum(['male', 'female', 'nam', 'nu']),
  cungMenh: z.string().min(1).max(20).optional(),
  nguHanh: z.string().min(1).max(20).optional(),
});

/**
 * POST /api/phongthuy/log
 * Log tra cuu phong thuy. User co/khong co tk deu duoc.
 * Body: { yearBorn, gender, cungMenh?, nguHanh? }
 *   - Neu chua co cungMenh/nguHanh, BE tu tinh tu yearBorn + gender.
 */
phongthuy.post('/log', maybeAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'bad_request',
        message: 'Du lieu khong hop le',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400
    );
  }

  // Chuan hoa gender
  const gender = parsed.data.gender === 'male' || parsed.data.gender === 'nam' ? 'nam' : 'nu';

  // Neu FE chua tinh, BE tu tinh
  let cung = parsed.data.cungMenh;
  let nguHanh = parsed.data.nguHanh;
  if (!cung || !nguHanh) {
    const computed = calcCung(parsed.data.yearBorn, gender);
    cung = cung ?? computed.cung;
    nguHanh = nguHanh ?? computed.nguHanh;
  }

  const session = getOptionalSession(c);
  const id = uid('pt');
  const now = new Date().toISOString();
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = c.req.header('user-agent') ?? null;

  try {
    exec(
      `INSERT INTO phongthuy_logs (id, user_id, year_born, gender, cung_menh, ngu_hanh, ip, ua, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, session?.sub ?? null, parsed.data.yearBorn, gender, cung, nguHanh, ip, ua, now]
    );
    return c.json({ ok: true, id, cungMenh: cung, nguHanh });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'phongthuy.log_failed',
        error: err instanceof Error ? err.message : 'unknown',
        ts: now,
      })
    );
    return c.json({ error: 'internal_error', message: 'Khong luu duoc log' }, 500);
  }
});

export default phongthuy;
