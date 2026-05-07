/**
 * REAL providers — goi Zeni Cloud / Zalo OA / VNPay / SendGrid / OAuth thuc te.
 *
 * TODO: implement from when Zeni Cloud spec is finalized.
 * Hien tai stub goi qua lib/zeni.ts (skeleton da co) hoac throw ProviderNotConfigured.
 */
import { l3, l4, l5 } from '../zeni.js';
import { env } from '../../env.js';

class ProviderNotConfigured extends Error {
  constructor(provider: string) {
    super(`Provider ${provider} chua duoc cau hinh cho REAL mode (cap nhat lib/providers/real.ts)`);
    this.name = 'ProviderNotConfigured';
  }
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
    if (!env.ZENI_L3_BASE_URL || !env.ZENI_L3_API_KEY) {
      throw new ProviderNotConfigured('ai (Zeni L3)');
    }
    const prompt = `${opts.roomType ?? ''} thiet ke ${opts.style}, hop cung menh ${opts.cungMenh ?? ''}, ngu hanh ${opts.nguHanh ?? ''}`;
    const res = await l3.generateInterior({
      sourceImageUrl: opts.imageUrl,
      prompt,
      numOutputs: 4,
    });
    return { results: res.results, jobId: res.jobId, prompt };
  },
};

// =====================================================
// ZALO Official Account
// =====================================================
export const zalo = {
  async sendOA(
    _zaloUid: string,
    _template: string,
    _vars: Record<string, unknown>
  ): Promise<{ ok: true; messageId: string }> {
    if (!env.ZALO_OA_ACCESS_TOKEN) {
      throw new ProviderNotConfigured('zalo OA');
    }
    // TODO: implement when Zeni Cloud spec available — POST https://openapi.zalo.me/v3.0/oa/message
    throw new ProviderNotConfigured('zalo.sendOA (chua co implement REST call)');
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
    if (!env.VNPAY_RETURN_URL) throw new ProviderNotConfigured('vnpay');
    const intent = await l4.createVnpayIntent({
      orderId: input.reference,
      amount: input.amount,
      orderInfo: input.description,
      returnUrl: env.VNPAY_RETURN_URL,
    });
    return {
      qrUrl: intent.qrUrl ?? '',
      bankInfo: { bank: '', accountNumber: '', accountName: '' },
      intentId: input.reference,
      payUrl: intent.payUrl,
      expiresAt: intent.expiresAt,
    };
  },

  /**
   * TODO: implement HMAC verify per VNPay spec (vnp_SecureHash check).
   */
  verifyWebhook(_payload: Record<string, unknown>, _signature?: string): boolean {
    return false;
  },
};

// =====================================================
// EMAIL (Gmail SMTP qua nodemailer — dung tam khi chua co SendGrid)
// =====================================================
import nodemailer from 'nodemailer';

let _smtpTx: nodemailer.Transporter | null = null;
function getSmtp() {
  if (_smtpTx) return _smtpTx;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new ProviderNotConfigured('email (SMTP — thieu SMTP_HOST/USER/PASS)');
  }
  _smtpTx = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return _smtpTx;
}

export const email = {
  async send(input: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<{ ok: true; messageId: string }> {
    const tx = getSmtp();
    const info = await tx.sendMail({
      from: input.from || env.SMTP_FROM || `"VIET CONTECH" <${env.SMTP_USER}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { ok: true, messageId: info.messageId };
  },
  async sendOtp(input: { to: string; name: string; otp: string; ttlMinutes: number }): Promise<{ ok: true; messageId: string }> {
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#07090C;font-family:Helvetica,Arial,sans-serif;color:#EDE8DC">
<div style="max-width:520px;margin:0 auto;background:#0C1016;border:1px solid rgba(212,160,136,.22);border-radius:12px;overflow:hidden">
  <div style="padding:28px 32px 16px;background:linear-gradient(135deg,rgba(180,120,85,.08),transparent);border-bottom:1px solid rgba(212,160,136,.15)">
    <div style="font-family:'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:.18em;background:linear-gradient(135deg,#B47855,#F2CCB0 50%,#B47855);-webkit-background-clip:text;-webkit-text-fill-color:transparent;color:#D4A088">VIET CONTECH</div>
    <div style="font-size:11px;color:#8A8070;letter-spacing:.18em;text-transform:uppercase;margin-top:4px">Phục Hưng Không Gian Sống</div>
  </div>
  <div style="padding:32px 32px 28px">
    <div style="font-family:'Times New Roman',serif;font-size:20px;font-weight:600;color:#EDE8DC;margin-bottom:16px">Chào ${input.name},</div>
    <div style="font-size:14px;color:#8A8070;line-height:1.65;margin-bottom:24px">Em là VIET CONTECH. Mã xác minh đăng ký tài khoản của anh/chị là:</div>
    <div style="text-align:center;margin:28px 0">
      <div style="display:inline-block;padding:18px 28px;background:linear-gradient(135deg,#B47855,#E8B89A);color:#0A0700;font-family:'Times New Roman',serif;font-size:30px;font-weight:700;letter-spacing:.5em;border-radius:6px">${input.otp}</div>
    </div>
    <div style="font-size:12px;color:#8A8070;line-height:1.6;margin-bottom:18px">Mã có hiệu lực trong <strong style="color:#D4A088">${input.ttlMinutes} phút</strong>. Vui lòng không chia sẻ với bất kỳ ai khác.</div>
    <div style="font-size:11px;color:#50483C;line-height:1.6;border-top:1px solid rgba(212,160,136,.1);padding-top:14px;margin-top:18px">Nếu anh/chị không yêu cầu mã này, có thể bỏ qua email. Tài khoản vẫn an toàn.</div>
  </div>
  <div style="padding:16px 32px;background:rgba(0,0,0,.2);border-top:1px solid rgba(212,160,136,.1);font-size:10px;color:#50483C;text-align:center">© 2025 VIET CONTECH · Công Ty CP Công Nghệ Xây Dựng VIET CONTECH</div>
</div></body></html>`;
    return this.send({ to: input.to, subject: `[VIET CONTECH] Mã xác minh: ${input.otp}`, html });
  },
};

// =====================================================
// SSO (Google / Zalo / Zeni qua L5)
// =====================================================
type SsoProvider = 'google' | 'zalo' | 'zeni';

export const sso = {
  getAuthorizeUrl(opts: {
    provider: SsoProvider;
    state: string;
    redirectUri: string;
  }): string {
    if (opts.provider === 'zeni') {
      if (!env.ZENI_L5_AUTHORIZE_URL || !env.ZENI_L5_CLIENT_ID) {
        throw new ProviderNotConfigured('sso (Zeni L5)');
      }
      const url = new URL(env.ZENI_L5_AUTHORIZE_URL);
      url.searchParams.set('client_id', env.ZENI_L5_CLIENT_ID);
      url.searchParams.set('redirect_uri', opts.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid profile email');
      url.searchParams.set('state', opts.state);
      return url.toString();
    }
    if (opts.provider === 'google') {
      if (!env.GOOGLE_CLIENT_ID) throw new ProviderNotConfigured('sso (Google)');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      url.searchParams.set('redirect_uri', opts.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid profile email');
      url.searchParams.set('state', opts.state);
      return url.toString();
    }
    if (opts.provider === 'zalo') {
      if (!env.ZALO_APP_ID) throw new ProviderNotConfigured('sso (Zalo)');
      const url = new URL('https://oauth.zaloapp.com/v4/permission');
      url.searchParams.set('app_id', env.ZALO_APP_ID);
      url.searchParams.set('redirect_uri', opts.redirectUri);
      url.searchParams.set('state', opts.state);
      return url.toString();
    }
    throw new ProviderNotConfigured(`sso (${opts.provider})`);
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
    if (opts.provider === 'zeni') {
      const tokens = await l5.exchangeCode(opts.code);
      const profile = await l5.getUserInfo(tokens.access_token);
      return {
        user: {
          email: profile.email,
          name: profile.name,
          avatar: null,
          provider: 'zeni',
          providerUid: profile.sub,
        },
      };
    }
    // TODO: implement Google + Zalo OAuth code exchange when client_secret is set.
    throw new ProviderNotConfigured(`sso.exchangeCode (${opts.provider})`);
  },
};
