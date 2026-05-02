import { Hono } from 'hono';
import { z } from 'zod';
import { exec, queryOne } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { zalo, email } from '../lib/providers/index.js';
import { rateLimit } from '../lib/ratelimit.js';
import { env } from '../env.js';

const contact = new Hono();

contact.use('/', rateLimit({ key: 'contact', max: 10, windowMs: 60_000 }));

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Ho ten qua ngan').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(\+84|0)[0-9]{9,10}$/, 'So dien thoai khong hop le'),
  email: z.string().email('Email khong hop le').optional(),
  area: z.union([z.coerce.number().positive().max(10000), z.string()]).optional(),
  need: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  source: z.string().max(100).optional(),
  refCode: z.string().max(50).optional(),
});

/**
 * POST /api/contact
 * 1. Validate
 * 2. INSERT contacts
 * 3. Fire-and-forget zalo OA + email sales
 * 4. Neu refCode -> log affiliate_clicks va tang counter
 */
contact.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
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

  const data = parsed.data;
  const id = uid('cnt');
  const now = new Date().toISOString();
  // area co the la string ('100m2'), parse so
  let areaNum: number | null = null;
  if (typeof data.area === 'number') areaNum = data.area;
  else if (typeof data.area === 'string') {
    const m = data.area.match(/(\d+(?:\.\d+)?)/);
    if (m) areaNum = parseFloat(m[1]!);
  }

  try {
    exec(
      `INSERT INTO contacts (id, name, phone, email, area, need, note, source, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      [
        id,
        data.name,
        data.phone,
        data.email ?? null,
        areaNum,
        data.need ?? null,
        data.note ?? null,
        data.source ?? null,
        now,
      ]
    );

    // Affiliate tracking neu co refCode
    if (data.refCode) {
      const aff = queryOne<{ id: string }>(
        `SELECT id FROM affiliates WHERE ref_code = ? LIMIT 1`,
        [data.refCode]
      );
      if (aff) {
        const clickId = uid('aclk');
        const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
        const ua = c.req.header('user-agent') ?? null;
        try {
          exec(
            `INSERT INTO affiliate_clicks (id, affiliate_id, source, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [clickId, aff.id, 'contact_form', ip, ua, now]
          );
          exec(`UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE id = ?`, [aff.id]);
        } catch {
          /* ignore log error */
        }
      }
    }

    // Fire-and-forget Zalo OA + email
    zalo
      .sendOA('sales_team', 'new_contact', {
        name: data.name,
        phone: data.phone,
        need: data.need ?? '',
      })
      .catch(() => undefined);

    email
      .send({
        to: env.SALES_NOTIFY_EMAIL,
        subject: `Lead moi: ${data.name} - ${data.phone}`,
        html: `
          <h3>Lead moi tu landing page</h3>
          <ul>
            <li><b>Ho ten:</b> ${escapeHtml(data.name)}</li>
            <li><b>So dien thoai:</b> ${escapeHtml(data.phone)}</li>
            <li><b>Email:</b> ${escapeHtml(data.email ?? '(khong co)')}</li>
            <li><b>Dien tich:</b> ${areaNum ?? '(khong ro)'} m2</li>
            <li><b>Nhu cau:</b> ${escapeHtml(data.need ?? '(chua nhap)')}</li>
            <li><b>Ghi chu:</b> ${escapeHtml(data.note ?? '')}</li>
          </ul>
        `,
      })
      .catch(() => undefined);

    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'contact.created',
        id,
        hasEmail: !!data.email,
        hasRef: !!data.refCode,
        ts: now,
      })
    );

    return c.json(
      {
        ok: true,
        id,
        message: 'Da ghi nhan, designer se goi trong 1 gio',
      },
      201
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'contact.insert_failed',
        error: err instanceof Error ? err.message : 'unknown',
        ts: now,
      })
    );
    return c.json({ error: 'internal_error', message: 'Khong luu duoc lien he, vui long thu lai' }, 500);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default contact;
