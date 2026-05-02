import { Hono } from 'hono';
import { z } from 'zod';
import { l2, l4 } from '../lib/zeni.js';
import { maybeAuth, getOptionalSession } from '../lib/auth.js';
import type { Booking } from '../types.js';

const booking = new Hono();

const bookingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^(\+84|0)[0-9]{9,10}$/, 'So dien thoai khong hop le'),
  email: z.string().email().optional(),
  scheduledAt: z.string().datetime({ message: 'scheduledAt phai la ISO datetime' }),
  topic: z.string().trim().min(2).max(200),
  branch: z.string().trim().max(100).optional(),
});

/**
 * POST /api/booking
 * Dat lich tu van. Co the la guest hoac user dang nhap.
 * 1. INSERT viet_contech.bookings
 * 2. Emit 'booking.created' -> Lop 04 -> Zalo OA confirm + email reminder
 */
booking.post('/', maybeAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }

  // Check tuong lai (khong cho dat lich qua khu)
  if (new Date(parsed.data.scheduledAt).getTime() < Date.now()) {
    return c.json({ error: 'bad_request', message: 'scheduledAt phai sau hien tai' }, 400);
  }

  const session = getOptionalSession(c);
  const row: Booking = {
    ...parsed.data,
    userId: session?.sub,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    const inserted = await l2.insert<Booking>('bookings', row);

    l4.emitEvent('booking.created', {
      id: inserted.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      scheduledAt: row.scheduledAt,
      topic: row.topic,
      branch: row.branch,
    }).catch((err) => {
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'l4.emit_failed',
        event: 'booking.created',
        error: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      }));
    });

    console.log(JSON.stringify({
      level: 'info',
      msg: 'booking.created',
      id: inserted.id,
      topic: row.topic,
      hasUser: !!session?.sub,
      ts: row.createdAt,
    }));

    return c.json({ ok: true, id: inserted.id, status: 'pending' }, 201);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'booking.insert_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'upstream_error' }, 502);
  }
});

export default booking;
