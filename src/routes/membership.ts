import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { db, exec, query, queryOne } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { requireAuth, getSession } from '../lib/auth.js';
import { vnpay } from '../lib/providers/index.js';
import type { Member, Payment } from '../types.js';

const membership = new Hono();

const upgradeSchema = z.object({
  plan: z.enum(['premium', 'vip']),
  cycle: z.enum(['monthly', 'yearly']),
});

/**
 * Bang gia (VND).
 */
const PRICING = {
  premium: { monthly: 199_000, yearly: 1_900_000 },
  vip: { monthly: 499_000, yearly: 4_900_000 },
} as const;

/**
 * POST /api/membership/upgrade (auth required)
 */
membership.post('/upgrade', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = upgradeSchema.safeParse(body);
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

  const amount = PRICING[parsed.data.plan][parsed.data.cycle];
  const reference = `VCT-MB-${Date.now()}-${session.sub.slice(0, 8)}`;
  const id = uid('pay');
  const now = new Date().toISOString();

  try {
    const intent = await vnpay.createIntent({
      amount,
      description: `Nang cap ${parsed.data.plan} (${parsed.data.cycle})`,
      reference,
    });

    exec(
      `INSERT INTO payments (id, user_id, amount_vnd, currency, gateway, gateway_txn, status, purpose, ref_id, created_at)
       VALUES (?, ?, ?, 'VND', 'vnpay', ?, 'pending', ?, ?, ?)`,
      [
        id,
        session.sub,
        amount,
        reference,
        `membership:${parsed.data.plan}:${parsed.data.cycle}`,
        reference,
        now,
      ]
    );

    return c.json({
      ok: true,
      paymentId: id,
      intentId: intent.intentId,
      reference,
      qrUrl: intent.qrUrl,
      payUrl: intent.payUrl,
      bankInfo: intent.bankInfo,
      amount,
      currency: 'VND',
      expiresAt: intent.expiresAt,
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'membership.upgrade_failed',
        userId: session.sub,
        error: err instanceof Error ? err.message : 'unknown',
        ts: now,
      })
    );
    return c.json({ error: 'upstream_error', message: 'Khong tao duoc lenh thanh toan' }, 502);
  }
});

const webhookSchema = z.object({
  reference: z.string().min(1),
  vnp_TxnRef: z.string().optional(),
  status: z.enum(['success', 'failed']).optional(),
  amount: z.coerce.number().int().positive().optional(),
  signature: z.string().optional(),
});

/**
 * POST /api/membership/webhook (no auth, verify HMAC signature)
 * VNPay goi callback bao giao dich done. Update payments + members.
 */
membership.post('/webhook', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request' }, 400);
  }

  const ok = vnpay.verifyWebhook(body, parsed.data.signature);
  if (!ok) {
    return c.json({ error: 'signature_mismatch' }, 401);
  }

  const reference = parsed.data.reference;
  const payment = queryOne<Payment>(
    `SELECT * FROM payments WHERE gateway_txn = ? OR ref_id = ? LIMIT 1`,
    [reference, reference]
  );

  if (!payment) {
    return c.json({ error: 'payment_not_found' }, 404);
  }

  const status = parsed.data.status ?? 'success';
  const now = new Date().toISOString();

  try {
    exec(`UPDATE payments SET status = ? WHERE id = ?`, [status, payment.id]);

    if (status === 'success' && payment.user_id && payment.purpose) {
      // purpose format: "membership:plan:cycle"
      const [, plan, cycle] = payment.purpose.split(':');
      if (plan && cycle && (plan === 'premium' || plan === 'vip')) {
        const months = cycle === 'yearly' ? 12 : 1;
        const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();
        // Tat tat ca membership active cu
        exec(`UPDATE members SET status = 'expired' WHERE user_id = ? AND status = 'active'`, [
          payment.user_id,
        ]);
        // Insert moi
        const memberId = uid('mb');
        exec(
          `INSERT INTO members (id, user_id, plan, started_at, expires_at, status, vnpay_txn_ref)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
          [memberId, payment.user_id, plan, now, expiresAt, reference]
        );
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'membership.webhook_failed',
        reference,
        error: err instanceof Error ? err.message : 'unknown',
        ts: now,
      })
    );
    return c.json({ error: 'internal_error' }, 500);
  }
});

export default membership;
