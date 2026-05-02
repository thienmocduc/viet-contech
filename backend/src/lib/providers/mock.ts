/**
 * MOCK providers — tra response gia realistic cho dev local.
 * KHONG goi external API.
 */
import { env } from '../../env.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => 800 + Math.floor(Math.random() * 1200); // 800-2000ms

function logProvider(provider: string, action: string, meta: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: `mock.${provider}.${action}`,
      ...meta,
      ts: new Date().toISOString(),
    })
  );
}

// =====================================================
// AI — render noi that
// =====================================================
export const ai = {
  async renderInterior(opts: {
    imageUrl: string;
    style: string;
    cungMenh?: string;
    nguHanh?: string;
    roomType?: string;
  }): Promise<{ results: string[]; jobId: string; prompt: string }> {
    await sleep(randomDelay());
    const slug = (opts.style || 'modern')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30) || 'design';
    const baseId = Date.now();
    const results = [1, 2, 3, 4].map(
      (i) => `https://picsum.photos/seed/${slug}_${baseId}_${i}/1024/1024`
    );
    const jobId = `mock_aijob_${baseId}`;
    const prompt = `${opts.roomType ?? 'phong'} thiet ke ${opts.style}, hop cung ${opts.cungMenh ?? 'N/A'}, ngu hanh ${opts.nguHanh ?? 'N/A'}`;
    logProvider('ai', 'renderInterior', { jobId, style: opts.style });
    return { results, jobId, prompt };
  },
};

// =====================================================
// ZALO Official Account
// =====================================================
export const zalo = {
  async sendOA(
    zaloUid: string,
    template: string,
    vars: Record<string, unknown>
  ): Promise<{ ok: true; messageId: string }> {
    await sleep(50);
    const messageId = `mock_zlmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logProvider('zalo', 'sendOA', { zaloUid, template, varsKeys: Object.keys(vars), messageId });
    return { ok: true, messageId };
  },
};

// =====================================================
// VNPay
// =====================================================
export const vnpay = {
  async createIntent(input: {
    amount: number;
    description: string;
    reference: string;
  }): Promise<{
    qrUrl: string;
    bankInfo: { bank: string; accountNumber: string; accountName: string };
    intentId: string;
    payUrl: string;
    expiresAt: string;
  }> {
    await sleep(120);
    const intentId = `mock_vnpay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 phut
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      `vietcontech://pay/${input.reference}/${input.amount}`
    )}`;
    const payUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${encodeURIComponent(
      input.reference
    )}&vnp_Amount=${input.amount * 100}`;
    const bankInfo = {
      bank: 'Vietcombank',
      accountNumber: '1234567890',
      accountName: 'CONG TY VIET-CONTECH',
    };
    logProvider('vnpay', 'createIntent', { intentId, amount: input.amount, reference: input.reference });
    return { qrUrl, bankInfo, intentId, payUrl, expiresAt };
  },

  /**
   * Mock verify webhook — luon return success.
   * O REAL mode se verify HMAC theo VNPAY_HASH_SECRET.
   */
  verifyWebhook(_payload: Record<string, unknown>, _signature?: string): boolean {
    return true;
  },
};

// =====================================================
// EMAIL (SendGrid mock)
// =====================================================
export const email = {
  async send(input: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<{ ok: true; messageId: string }> {
    await sleep(40);
    const messageId = `mock_email_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    logProvider('email', 'send', {
      to: input.to,
      subject: input.subject,
      from: input.from ?? env.SENDGRID_FROM_EMAIL ?? 'no-reply@vietcontech.com',
      messageId,
    });
    return { ok: true, messageId };
  },
};

// =====================================================
// SSO (Google / Zalo / Zeni)
// =====================================================
type SsoProvider = 'google' | 'zalo' | 'zeni';

export const sso = {
  /**
   * Tra ve URL mock se tu redirect ve redirectUri kem code=mock_code_<state>.
   * Local dev co the load URL nay vao browser de test toan bo flow.
   */
  getAuthorizeUrl(opts: {
    provider: SsoProvider;
    state: string;
    redirectUri: string;
  }): string {
    const code = `mock_code_${opts.state}`;
    const url = new URL(opts.redirectUri);
    url.searchParams.set('code', code);
    url.searchParams.set('state', opts.state);
    url.searchParams.set('provider', opts.provider);
    logProvider('sso', 'getAuthorizeUrl', { provider: opts.provider, state: opts.state });
    return url.toString();
  },

  async exchangeCode(opts: {
    provider: SsoProvider;
    code: string;
    redirectUri: string;
  }): Promise<{
    user: {
      email: string;
      name: string;
      avatar: string | null;
      provider: SsoProvider;
      providerUid: string;
    };
  }> {
    await sleep(150);
    const stamp = Math.random().toString(36).slice(2, 8);
    const providerUid = `${opts.provider}_uid_${stamp}`;
    const fakeNames: Record<SsoProvider, string> = {
      google: 'Nguyen Van Google',
      zalo: 'Tran Thi Zalo',
      zeni: 'Le Van Zeni',
    };
    const user = {
      email: `mock_${opts.provider}_${stamp}@example.com`,
      name: fakeNames[opts.provider],
      avatar: `https://i.pravatar.cc/200?u=${providerUid}`,
      provider: opts.provider,
      providerUid,
    };
    logProvider('sso', 'exchangeCode', { provider: opts.provider, email: user.email });
    return { user };
  },
};
