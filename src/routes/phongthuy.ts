import { Hono } from 'hono';
import { z } from 'zod';
import { l2 } from '../lib/zeni.js';
import { maybeAuth, getOptionalSession } from '../lib/auth.js';

const phongthuy = new Hono();

const logSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  gender: z.enum(['nam', 'nu']),
  cung: z.string().min(1).max(20),
  nh: z.enum(['Dong tu menh', 'Tay tu menh']),
  dirs: z.object({
    sinhKhi: z.string(),
    thienY: z.string(),
    dienNien: z.string(),
    phucVi: z.string(),
  }),
  bad: z
    .object({
      tuyetMenh: z.string(),
      nguQuy: z.string(),
      lucSat: z.string(),
      hoaHai: z.string(),
    })
    .optional(),
});

/**
 * POST /api/phongthuy/log
 * Luu ket qua tinh phong thuy de analytics (popular cung, conversion...).
 * Khong yeu cau dang nhap — guest cung log duoc.
 */
phongthuy.post('/log', maybeAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }

  const session = getOptionalSession(c);
  const row = {
    user_id: session?.sub ?? null,
    year: parsed.data.year,
    gender: parsed.data.gender,
    cung: parsed.data.cung,
    nh: parsed.data.nh,
    dirs: parsed.data.dirs,
    bad: parsed.data.bad ?? null,
    created_at: new Date().toISOString(),
  };

  try {
    const inserted = await l2.insert<{ id: string }>('phongthuy_logs', row);
    console.log(JSON.stringify({
      level: 'info',
      msg: 'phongthuy.logged',
      id: inserted.id,
      cung: row.cung,
      hasUser: !!session?.sub,
      ts: row.created_at,
    }));
    return c.json({ ok: true, id: inserted.id }, 201);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'phongthuy.log_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'upstream_error' }, 502);
  }
});

export default phongthuy;
