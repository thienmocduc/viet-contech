import { Hono } from 'hono';
import { z } from 'zod';
import { exec } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { maybeAuth, getOptionalSession } from '../lib/auth.js';
import { zalo, email } from '../lib/providers/index.js';
import { env } from '../env.js';

const booking = new Hono();

const bookingSchema = z.object({
  type: z.enum(['style', 'review', 'phongthuy', 'quote']),
  scheduledAt: z.string().datetime({ message: 'scheduledAt phai la ISO datetime (e.g. 2026-05-10T14:00:00Z)' }),
  note: z.string().trim().max(2000).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+84|0)[0-9]{9,10}$/, 'So dien thoai khong hop le'),
  name: z.string().trim().min(2).max(100),
  email: z.string().email().optional(),
  branch: z.string().trim().max(100).optional(),
});

/**
 * POST /api/booking (auth optional)
 * Tao booking, gui Zalo OA confirm cho user + email cho designer.
 */
booking.post('/', maybeAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = bookingSchema.safeParse(body);
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

  if (new Date(parsed.data.scheduledAt).getTime() < Date.now()) {
    return c.json({ error: 'bad_request', message: 'scheduledAt phai sau hien tai' }, 400);
  }

  const session = getOptionalSession(c);
  const id = uid('bkg');
  const confirmCode = `BK${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const now = new Date().toISOString();

  // Note tong hop
  const composedNote = [
    `Khach: ${parsed.data.name} (${parsed.data.phone})`,
    parsed.data.email ? `Email: ${parsed.data.email}` : null,
    parsed.data.branch ? `Chi nhanh: ${parsed.data.branch}` : null,
    parsed.data.note ? `Ghi chu: ${parsed.data.note}` : null,
    `Ma xac nhan: ${confirmCode}`,
  ]
    .filter(Boolean)
    .join(' | ');

  try {
    exec(
      `INSERT INTO bookings (id, user_id, type, scheduled_at, duration_min, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, session?.sub ?? null, parsed.data.type, parsed.data.scheduledAt, 30, composedNote, now]
    );

    // Fire-and-forget notifications
    zalo
      .sendOA(session?.sub ?? 'guest', 'booking_confirm', {
        name: parsed.data.name,
        type: parsed.data.type,
        scheduledAt: parsed.data.scheduledAt,
        confirmCode,
      })
      .catch(() => undefined);

    email
      .send({
        to: env.DESIGNER_NOTIFY_EMAIL,
        subject: `Booking moi (${parsed.data.type}) - ${parsed.data.name}`,
        html: `
          <h3>Lich tu van moi</h3>
          <ul>
            <li><b>Khach:</b> ${escapeHtml(parsed.data.name)} (${escapeHtml(parsed.data.phone)})</li>
            <li><b>Loai:</b> ${parsed.data.type}</li>
            <li><b>Thoi gian:</b> ${parsed.data.scheduledAt}</li>
            <li><b>Ma xac nhan:</b> ${confirmCode}</li>
            <li><b>Ghi chu:</b> ${escapeHtml(parsed.data.note ?? '')}</li>
          </ul>
        `,
      })
      .catch(() => undefined);

    return c.json({ ok: true, id, confirmCode }, 201);
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'booking.insert_failed',
        error: err instanceof Error ? err.message : 'unknown',
        ts: now,
      })
    );
    return c.json({ error: 'internal_error', message: 'Khong tao duoc booking' }, 500);
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

export default booking;
