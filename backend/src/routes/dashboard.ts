import { Hono } from 'hono';
import { l2 } from '../lib/zeni.js';
import { requireAuth, getSession } from '../lib/auth.js';
import type { CustomerDashboard, SaleDashboard, AiDesignResponse, Booking } from '../types.js';

const dashboard = new Hono();

/**
 * GET /api/dashboard/customer
 * Tra ve thiet ke AI da tao + lich tu van + trang thai membership.
 * TODO: gop song song (Promise.all) va cache 60s khi co Lop 02 cache layer.
 */
dashboard.get('/customer', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role === 'sale' || session.role === 'admin') {
    return c.json({ error: 'forbidden', message: 'Khong phai customer' }, 403);
  }

  try {
    const [designs, bookings] = await Promise.all([
      l2.select<AiDesignResponse>('ai_designs', { user_id: session.sub }, 20),
      l2.select<Booking>('bookings', { user_id: session.sub }, 20),
    ]);

    // TODO: query thuc te bang membership (viet_contech.memberships)
    const payload: CustomerDashboard = {
      user: {
        id: session.sub,
        email: session.email,
        fullName: '', // TODO fill tu Lop 02
        membershipTier: 'free',
      },
      designs,
      bookings,
      membership: {
        tier: 'free',
        benefits: ['1 thiet ke AI/thang', 'Tu van phong thuy co ban'],
      },
    };
    return c.json(payload);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'dashboard.customer_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'upstream_error' }, 502);
  }
});

/**
 * GET /api/dashboard/sale
 * Pipeline leads + commission cho sale staff.
 */
dashboard.get('/sale', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role !== 'sale' && session.role !== 'admin') {
    return c.json({ error: 'forbidden', message: 'Chi sale/admin moi xem duoc' }, 403);
  }

  try {
    // TODO: thay bang query aggregate thuc te tu Lop 02
    // VD: SELECT stage, COUNT(*), SUM(value) FROM leads WHERE owner=$1 GROUP BY stage
    const payload: SaleDashboard = {
      user: { id: session.sub, email: session.email, fullName: '' },
      pipeline: [
        { stage: 'new', count: 0, value: 0 },
        { stage: 'contacted', count: 0, value: 0 },
        { stage: 'quoted', count: 0, value: 0 },
        { stage: 'won', count: 0, value: 0 },
        { stage: 'lost', count: 0, value: 0 },
      ],
      commissions: [],
    };
    return c.json(payload);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'dashboard.sale_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'upstream_error' }, 502);
  }
});

export default dashboard;
