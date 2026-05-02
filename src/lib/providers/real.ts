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
// EMAIL (SendGrid)
// =====================================================
export const email = {
  async send(_input: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<{ ok: true; messageId: string }> {
    if (!env.SENDGRID_API_KEY) throw new ProviderNotConfigured('email (SendGrid)');
    // TODO: implement SendGrid REST call when key available.
    throw new ProviderNotConfigured('email.send (chua co implement SendGrid)');
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
