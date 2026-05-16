import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { env } from '../env.js';
import { exec, queryOne, query } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { requireAuth, getSession } from '../lib/auth.js';
import { logEvent } from '../lib/gamify.js';
import { audit } from '../lib/audit.js';

const affiliate = new Hono();

/**
 * Tier commission theo total doanh thu lifetime:
 *   Đồng  0-50M     3%
 *   Bạc   50-150M   5%
 *   Vàng  150-500M  8%
 *   KC    500M+     12%
 */
function commissionRate(totalRevenue: number): number {
  if (totalRevenue >= 500_000_000) return 12;
  if (totalRevenue >= 150_000_000) return 8;
  if (totalRevenue >= 50_000_000) return 5;
  return 3;
}
function tierLabel(rate: number): string {
  if (rate >= 12) return 'Kim Cương';
  if (rate >= 8) return 'Vàng';
  if (rate >= 5) return 'Bạc';
  return 'Đồng';
}

/**
 * POST /api/affiliate/track?code=
 * Log click vao affiliate_clicks, set cookie vct_ref 30 ngay,
 * redirect ve FRONTEND_URL?ref=<code>.
 *
 * Cho phep ca GET de su dung tu link share dang link redirect.
 */
const handler = async (c: Context) => {
  const code = c.req.query('code');
  if (!code) {
    return c.json({ error: 'bad_request', message: 'Thieu code' }, 400);
  }

  const aff = queryOne<{ id: string }>(`SELECT id FROM affiliates WHERE ref_code = ? LIMIT 1`, [
    code,
  ]);

  if (aff) {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const ua = c.req.header('user-agent') ?? null;
    const now = new Date().toISOString();
    try {
      exec(
        `INSERT INTO affiliate_clicks (id, affiliate_id, source, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [uid('aclk'), aff.id, c.req.query('source') ?? 'link', ip, ua, now]
      );
      exec(`UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE id = ?`, [aff.id]);
    } catch {
      /* ignore */
    }
  }

  setCookie(c, 'vct_ref', code, {
    httpOnly: false,
    secure: env.NODE_ENV !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  const target = `${env.FRONTEND_URL}${env.FRONTEND_URL.includes('?') ? '&' : '?'}ref=${encodeURIComponent(code)}`;
  return c.redirect(target, 302);
};

affiliate.get('/track', handler);
affiliate.post('/track', handler);

/**
 * GET /api/affiliate/me — Tong quan affiliate cua user dang dang nhap.
 */
affiliate.get('/me', requireAuth, (c) => {
  const session = getSession(c);
  const userId = session.sub;
  const totalRow = queryOne<{ revenue: number; commission: number; total: number; paid: number }>(
    `SELECT
       COALESCE(SUM(project_value),0) AS revenue,
       COALESCE(SUM(commission),0) AS commission,
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END),0) AS paid
     FROM affiliate_referrals WHERE referrer_id=?`,
    [userId]
  );
  const payoutTotalRow = queryOne<{ available: number; pending: number; paid: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS paid,
       COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pending,
       0 AS available
     FROM affiliate_payouts WHERE user_id=?`,
    [userId]
  );
  const commissionTotal = totalRow?.commission ?? 0;
  const paidOut = payoutTotalRow?.paid ?? 0;
  const pending = payoutTotalRow?.pending ?? 0;
  const available = Math.max(0, commissionTotal - paidOut - pending);
  const revenue = totalRow?.revenue ?? 0;
  const rate = commissionRate(revenue);
  return c.json({
    ok: true,
    summary: {
      totalReferrals: totalRow?.total ?? 0,
      paidReferrals: totalRow?.paid ?? 0,
      totalRevenue: revenue,
      totalCommission: commissionTotal,
      availableForWithdraw: available,
      pendingWithdraw: pending,
      paidOut,
    },
    tier: { rate, label: tierLabel(rate) },
  });
});

/**
 * GET /api/affiliate/referrals — Danh sach khach minh gioi thieu.
 */
affiliate.get('/referrals', requireAuth, (c) => {
  const session = getSession(c);
  const rows = query<{
    id: string;
    ref_code: string;
    referred_id: string | null;
    email_hint: string | null;
    status: string;
    project_value: number;
    commission: number;
    created_at: string;
    paid_at: string | null;
  }>(
    `SELECT id, ref_code, referred_id, email_hint, status, project_value, commission, created_at, paid_at
     FROM affiliate_referrals WHERE referrer_id=? ORDER BY created_at DESC LIMIT 100`,
    [session.sub]
  );
  return c.json({ ok: true, referrals: rows });
});

/**
 * GET /api/affiliate/leaderboard — Top 10 affiliate theo doanh thu thang nay.
 */
affiliate.get('/leaderboard', (c) => {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const rows = query<{
    user_id: string;
    name: string;
    revenue: number;
    commission: number;
    refs: number;
  }>(
    `SELECT ar.referrer_id AS user_id, u.name,
       SUM(ar.project_value) AS revenue,
       SUM(ar.commission) AS commission,
       COUNT(*) AS refs
     FROM affiliate_referrals ar LEFT JOIN users u ON u.id=ar.referrer_id
     WHERE ar.created_at >= ?
     GROUP BY ar.referrer_id
     ORDER BY revenue DESC LIMIT 10`,
    [monthStart]
  );
  return c.json({
    ok: true,
    month: monthStart.slice(0, 7),
    top: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      name: r.name || 'Anonymous',
      revenue: r.revenue,
      commission: r.commission,
      refs: r.refs,
      tier: tierLabel(commissionRate(r.revenue)),
    })),
  });
});

/**
 * POST /api/affiliate/payout — Yeu cau rut tien.
 * Body: { amount, method, accountInfo }
 */
const payoutSchema = z.object({
  amount: z.number().int().min(100_000),
  method: z.enum(['bank', 'momo', 'zalopay', 'vnpay']),
  accountInfo: z.string().min(4).max(200),
});
affiliate.post('/payout', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = payoutSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  // Check available balance
  const commissionRow = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(commission),0) AS total FROM affiliate_referrals WHERE referrer_id=?`,
    [session.sub]
  );
  const paidOutRow = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0) AS total FROM affiliate_payouts WHERE user_id=? AND status IN ('paid','approved','pending')`,
    [session.sub]
  );
  const available = (commissionRow?.total ?? 0) - (paidOutRow?.total ?? 0);
  if (parsed.data.amount > available) {
    return c.json({ error: 'insufficient', message: `Khong du so du. Kha dung: ${available.toLocaleString('vi-VN')} VND` }, 400);
  }
  const id = uid('apo');
  exec(
    `INSERT INTO affiliate_payouts (id, user_id, amount, method, account_info, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [id, session.sub, parsed.data.amount, parsed.data.method, parsed.data.accountInfo, new Date().toISOString()]
  );
  audit(c, 'affiliate.payout_request', { type: 'payout', id }, parsed.data);
  return c.json({ ok: true, id, status: 'pending', message: 'Yeu cau rut tien duoc gui — xu ly trong 24-48h' }, 201);
});

/**
 * POST /api/affiliate/register-ref — Khi khach moi register voi ?ref=<code>,
 * FE gui ref_code de tao referral row pending.
 */
const regRefSchema = z.object({ refCode: z.string().min(3).max(40), emailHint: z.string().email().optional() });
affiliate.post('/register-ref', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = regRefSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
  const aff = queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM affiliates WHERE ref_code=? LIMIT 1`,
    [parsed.data.refCode]
  );
  if (!aff) return c.json({ error: 'not_found', message: 'Ma gioi thieu khong ton tai' }, 404);
  const id = uid('ar');
  const now = new Date().toISOString();
  exec(
    `INSERT INTO affiliate_referrals (id, ref_code, referrer_id, email_hint, status, project_value, commission, commission_rate, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'registered', 0, 0, 3, ?, ?)`,
    [id, parsed.data.refCode, aff.user_id, parsed.data.emailHint ?? null, now, now]
  );
  try {
    logEvent(aff.user_id, 'refer', { refId: id });
  } catch {
    /* ignore */
  }
  return c.json({ ok: true, refId: id }, 201);
});

export default affiliate;
