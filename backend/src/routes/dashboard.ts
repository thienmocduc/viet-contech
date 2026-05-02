import { Hono } from 'hono';
import { query, queryOne } from '../lib/db.js';
import { requireAuth, getSession } from '../lib/auth.js';
import type {
  Booking,
  Contact,
  Design,
  Member,
  Payment,
  PhongThuyLog,
  User,
} from '../types.js';

const dashboard = new Hono();

/**
 * GET /api/dashboard/customer (auth required)
 */
dashboard.get('/customer', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role === 'admin' || session.role === 'sale') {
    // Admin/sale van xem duoc nhung doc note: dat gia tri rieng
  }
  try {
    const user = queryOne<User>(`SELECT * FROM users WHERE id = ? LIMIT 1`, [session.sub]);
    const designs = query<Design>(
      `SELECT * FROM designs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [session.sub]
    );
    const bookings = query<Booking>(
      `SELECT * FROM bookings WHERE user_id = ? ORDER BY scheduled_at DESC LIMIT 20`,
      [session.sub]
    );
    const member = queryOne<Member>(
      `SELECT * FROM members WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [session.sub]
    );
    const recentPhongthuy = query<PhongThuyLog>(
      `SELECT * FROM phongthuy_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
      [session.sub]
    );

    // Parse results_json cho moi design
    const designsParsed = designs.map((d) => {
      let results: string[] = [];
      if (d.results_json) {
        try {
          results = JSON.parse(d.results_json) as string[];
        } catch {
          /* ignore */
        }
      }
      return { ...d, results };
    });

    return c.json({
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            role: user.role,
          }
        : null,
      designs: designsParsed,
      bookings,
      member: member ?? { plan: 'free', status: 'active' },
      recentPhongthuy,
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'dashboard.customer_failed',
        userId: session.sub,
        error: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      })
    );
    return c.json({ error: 'internal_error' }, 500);
  }
});

/**
 * GET /api/dashboard/sale (auth required: sale|admin)
 */
dashboard.get('/sale', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role !== 'sale' && session.role !== 'admin') {
    return c.json({ error: 'forbidden', message: 'Chi sale/admin moi xem duoc' }, 403);
  }

  try {
    const isAdmin = session.role === 'admin';
    const ownFilter = isAdmin ? '' : 'WHERE assigned_to = ?';
    const ownArgs = isAdmin ? [] : [session.sub];

    const leads = query<Contact>(
      `SELECT * FROM contacts ${ownFilter} ORDER BY created_at DESC LIMIT 50`,
      ownArgs
    );

    const stages = ['new', 'contacted', 'proposed', 'negotiating', 'won', 'lost'] as const;
    const pipeline: Record<string, number> = {};
    for (const s of stages) {
      const row = queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM contacts WHERE status = ?${isAdmin ? '' : ' AND assigned_to = ?'}`,
        isAdmin ? [s] : [s, session.sub]
      );
      pipeline[s] = row?.c ?? 0;
    }

    // Commissions: tinh tu affiliate cua user neu co
    const aff = queryOne<{ total_commission_vnd: number }>(
      `SELECT total_commission_vnd FROM affiliates WHERE user_id = ? LIMIT 1`,
      [session.sub]
    );
    const totalCommission = aff?.total_commission_vnd ?? 0;

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthRow = queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount_vnd), 0) as s FROM payments WHERE status = 'success' AND created_at >= ?`,
      [monthStart]
    );

    // Leaderboard top 5 affiliates
    const leaderboard = query<{
      ref_code: string;
      total_commission_vnd: number;
      total_signups: number;
    }>(
      `SELECT a.ref_code, a.total_commission_vnd, a.total_signups, u.name as user_name
       FROM affiliates a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.total_commission_vnd DESC
       LIMIT 5`,
      []
    );

    return c.json({
      leads,
      pipeline,
      commissions: {
        total: totalCommission,
        thisMonth: monthRow?.s ?? 0,
      },
      leaderboard,
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'dashboard.sale_failed',
        userId: session.sub,
        error: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      })
    );
    return c.json({ error: 'internal_error' }, 500);
  }
});

/**
 * GET /api/dashboard/admin (auth required: admin)
 */
dashboard.get('/admin', requireAuth, async (c) => {
  const session = getSession(c);
  if (session.role !== 'admin') {
    return c.json({ error: 'forbidden', message: 'Chi admin moi xem duoc' }, 403);
  }

  try {
    const counts = {
      users: queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM users`, [])?.c ?? 0,
      designs: queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM designs`, [])?.c ?? 0,
      bookings: queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM bookings`, [])?.c ?? 0,
      payments:
        queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM payments WHERE status = 'success'`, [])
          ?.c ?? 0,
    };

    const recentSignups = query<User>(
      `SELECT id, email, name, role, provider, created_at FROM users ORDER BY created_at DESC LIMIT 10`,
      []
    );
    const recentPayments = query<Payment>(
      `SELECT * FROM payments ORDER BY created_at DESC LIMIT 10`,
      []
    );
    const topAffiliates = query(
      `SELECT a.*, u.name as user_name
       FROM affiliates a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.total_commission_vnd DESC
       LIMIT 10`,
      []
    );

    return c.json({
      counts,
      recentSignups,
      recentPayments,
      topAffiliates,
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'dashboard.admin_failed',
        userId: session.sub,
        error: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      })
    );
    return c.json({ error: 'internal_error' }, 500);
  }
});

export default dashboard;
