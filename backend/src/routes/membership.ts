import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { l2, l4 } from '../lib/zeni.js';
import { requireAuth, getSession } from '../lib/auth.js';
import type { VnpayIntent, MembershipUpgradeRequest } from '../types.js';

const membership = new Hono();

const upgradeSchema = z.object({
  tier: z.enum(['silver', 'gold', 'platinum']),
  durationMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
});

/**
 * Bang gia membership (VND).
 * TODO: chuyen sang viet_contech.pricing_tiers de ops chinh duoc, khoi deploy lai.
 */
const PRICING: Record<MembershipUpgradeRequest['tier'], number> = {
  silver: 199_000,
  gold: 499_000,
  platinum: 1_499_000,
};

/**
 * POST /api/membership/upgrade
 * 1. Validate tier + duration
 * 2. Tinh amount (price * months)
 * 3. INSERT viet_contech.membership_orders (status=pending)
 * 4. Goi Lop 04 connector VNPay -> nhan payUrl + qrUrl
 * 5. Tra ve cho client de hien QR
 */
membership.post('/upgrade', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = upgradeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }

  const amount = PRICING[parsed.data.tier] * parsed.data.durationMonths;
  const orderId = `VCT-MB-${Date.now()}-${session.sub.slice(0, 8)}`;

  try {
    // 1) Ghi don vao Lop 02
    await l2.insert('membership_orders', {
      order_id: orderId,
      user_id: session.sub,
      tier: parsed.data.tier,
      duration_months: parsed.data.durationMonths,
      amount,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    // 2) Tao VNPay intent qua Lop 04 connector
    if (!env.VNPAY_RETURN_URL) {
      return c.json({ error: 'config_missing', message: 'VNPAY_RETURN_URL chua cau hinh' }, 500);
    }
    const intent = await l4.createVnpayIntent({
      orderId,
      amount,
      orderInfo: `Nang cap ${parsed.data.tier} ${parsed.data.durationMonths} thang`,
      returnUrl: env.VNPAY_RETURN_URL,
    });

    const response: VnpayIntent = {
      orderId,
      amount,
      payUrl: intent.payUrl,
      qrUrl: intent.qrUrl,
      expiresAt: intent.expiresAt,
    };

    console.log(JSON.stringify({
      level: 'info',
      msg: 'membership.intent_created',
      orderId,
      tier: parsed.data.tier,
      amount,
      ts: new Date().toISOString(),
    }));

    return c.json(response);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'membership.upgrade_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'upstream_error', message: 'Khong tao duoc lenh thanh toan' }, 502);
  }
});

export default membership;
