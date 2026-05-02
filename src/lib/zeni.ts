import { env } from '../env.js';

/**
 * Helpers goi cac lop Zeni Cloud bang native fetch.
 * - Edge-friendly, khong lib HTTP nang
 * - Tat ca tra ve typed Promise<T>
 * - Loi network/4xx/5xx -> throw ZeniError, route handler bat va tra 502
 *
 * TODO (em main): khi Zeni Cloud release SDK chinh thuc thi swap.
 */

export class ZeniError extends Error {
  constructor(
    public layer: 'L2' | 'L3' | 'L4' | 'L5',
    public status: number,
    message: string,
    public detail?: unknown
  ) {
    super(message);
    this.name = 'ZeniError';
  }
}

/**
 * Throw neu env var bat buoc cho REAL mode bi thieu.
 * Goi truoc khi build URL/key trong moi Lop API.
 */
function requireEnv<T>(value: T | undefined, name: string, layer: 'L2' | 'L3' | 'L4' | 'L5'): T {
  if (value === undefined || value === null || value === '') {
    throw new ZeniError(layer, 0, `Env ${name} chua cau hinh (REAL mode required)`);
  }
  return value;
}

async function zfetch<T>(
  layer: 'L2' | 'L3' | 'L4' | 'L5',
  url: string,
  init: RequestInit & { apiKey: string }
): Promise<T> {
  const { apiKey, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'x-zeni-layer': layer,
      ...(headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new ZeniError(layer, res.status, `${layer} ${res.status} ${res.statusText}`, detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// =====================================================
// LOP 02 — DATA LAKE (Postgres REST)
// =====================================================
export const l2 = {
  /**
   * INSERT row vao bang.
   * TODO: dieu chinh path/payload theo spec REST API thuc te cua Lop 02.
   */
  async insert<T = unknown>(table: string, row: object): Promise<T> {
    const base = requireEnv(env.ZENI_L2_BASE_URL, 'ZENI_L2_BASE_URL', 'L2');
    const apiKey = requireEnv(env.ZENI_L2_API_KEY, 'ZENI_L2_API_KEY', 'L2');
    const url = `${base}/v1/${env.ZENI_L2_SCHEMA}/${table}`;
    return zfetch<T>('L2', url, {
      apiKey,
      method: 'POST',
      body: JSON.stringify(row),
    });
  },

  /**
   * SELECT theo filter (key=value).
   * TODO: doi sang query string format chuan cua Lop 02 (PostgREST? GraphQL?).
   */
  async select<T = unknown>(
    table: string,
    filter: Record<string, string | number> = {},
    limit = 50
  ): Promise<T[]> {
    const base = requireEnv(env.ZENI_L2_BASE_URL, 'ZENI_L2_BASE_URL', 'L2');
    const apiKey = requireEnv(env.ZENI_L2_API_KEY, 'ZENI_L2_API_KEY', 'L2');
    const qs = new URLSearchParams({ ...Object.fromEntries(
      Object.entries(filter).map(([k, v]) => [k, String(v)])
    ), limit: String(limit) });
    const url = `${base}/v1/${env.ZENI_L2_SCHEMA}/${table}?${qs.toString()}`;
    return zfetch<T[]>('L2', url, {
      apiKey,
      method: 'GET',
    });
  },
};

// =====================================================
// LOP 03 — AI ENGINE (sd-lora-interior)
// =====================================================
export const l3 = {
  /**
   * Upload anh len Object Storage cua Lop 03.
   * TODO: thuc te co the la presigned URL flow, em main dieu chinh.
   */
  async uploadObject(filename: string, contentType: string, data: ArrayBuffer): Promise<string> {
    const storageBase = requireEnv(env.ZENI_L3_STORAGE_BASE_URL, 'ZENI_L3_STORAGE_BASE_URL', 'L3');
    const apiKey = requireEnv(env.ZENI_L3_API_KEY, 'ZENI_L3_API_KEY', 'L3');
    const url = `${storageBase}/v1/buckets/${env.ZENI_L3_STORAGE_BUCKET}/objects/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': contentType,
      },
      body: data,
    });
    if (!res.ok) {
      throw new ZeniError('L3', res.status, `upload object failed: ${res.statusText}`);
    }
    return url;
  },

  /**
   * Generate 4 phuong an thiet ke noi that tu anh goc + prompt.
   * TODO: confirm payload schema voi team AI (dimensions, sampler, num_outputs...).
   */
  async generateInterior(input: {
    sourceImageUrl: string;
    prompt: string;
    negativePrompt?: string;
    numOutputs?: number;
  }): Promise<{ jobId: string; results: string[] }> {
    const base = requireEnv(env.ZENI_L3_BASE_URL, 'ZENI_L3_BASE_URL', 'L3');
    const apiKey = requireEnv(env.ZENI_L3_API_KEY, 'ZENI_L3_API_KEY', 'L3');
    const url = `${base}/v1/models/${env.ZENI_L3_MODEL}/predict`;
    return zfetch('L3', url, {
      apiKey,
      method: 'POST',
      body: JSON.stringify({
        source_image: input.sourceImageUrl,
        prompt: input.prompt,
        negative_prompt: input.negativePrompt ?? 'blurry, low quality, distorted',
        num_outputs: input.numOutputs ?? 4,
      }),
    });
  },
};

// =====================================================
// LOP 04 — AUTOMATION EVENT BUS
// =====================================================
export const l4 = {
  /**
   * Emit 1 event vao Event Bus, cac connector da subscribe se tu xu ly.
   * VD: 'contact.created' -> Zalo OA + email sales.
   * TODO: xac nhan endpoint /events/emit voi spec Lop 04.
   */
  async emitEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
    const base = requireEnv(env.ZENI_L4_BASE_URL, 'ZENI_L4_BASE_URL', 'L4');
    const apiKey = requireEnv(env.ZENI_L4_API_KEY, 'ZENI_L4_API_KEY', 'L4');
    const url = `${base}/v1/events/emit`;
    await zfetch<void>('L4', url, {
      apiKey,
      method: 'POST',
      body: JSON.stringify({
        event: eventName,
        ts: new Date().toISOString(),
        data: payload,
      }),
    });
  },

  /**
   * Tao VNPay payment intent qua connector cua Lop 04.
   * TODO: connector co the tra payUrl + qrUrl, em main map field cho dung.
   */
  async createVnpayIntent(input: {
    orderId: string;
    amount: number;
    orderInfo: string;
    returnUrl: string;
  }): Promise<{ payUrl: string; qrUrl?: string; expiresAt: string }> {
    const base = requireEnv(env.ZENI_L4_BASE_URL, 'ZENI_L4_BASE_URL', 'L4');
    const apiKey = requireEnv(env.ZENI_L4_API_KEY, 'ZENI_L4_API_KEY', 'L4');
    const url = `${base}/v1/connectors/vnpay/intents`;
    return zfetch('L4', url, {
      apiKey,
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

// =====================================================
// LOP 05 — IDENTITY SSO (OIDC / OAuth2)
// =====================================================
export const l5 = {
  /**
   * Doi authorization code lay access token.
   * Standard OAuth2 authorization_code grant.
   */
  async exchangeCode(code: string): Promise<{
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  }> {
    const tokenUrl = requireEnv(env.ZENI_L5_TOKEN_URL, 'ZENI_L5_TOKEN_URL', 'L5');
    const redirectUri = requireEnv(env.ZENI_L5_REDIRECT_URI, 'ZENI_L5_REDIRECT_URI', 'L5');
    const clientId = requireEnv(env.ZENI_L5_CLIENT_ID, 'ZENI_L5_CLIENT_ID', 'L5');
    const clientSecret = requireEnv(env.ZENI_L5_CLIENT_SECRET, 'ZENI_L5_CLIENT_SECRET', 'L5');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new ZeniError('L5', res.status, `exchange code failed: ${res.statusText}`);
    }
    return res.json() as Promise<{
      access_token: string;
      id_token?: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    }>;
  },

  /**
   * Lay user info tu Lop 05 dua tren access token.
   * TODO: map response cua Zeni SSO sang shape User cua minh (xem types.ts).
   */
  async getUserInfo(accessToken: string): Promise<{
    sub: string;
    email: string;
    name: string;
    phone_number?: string;
    role?: string;
  }> {
    const userinfoUrl = requireEnv(env.ZENI_L5_USERINFO_URL, 'ZENI_L5_USERINFO_URL', 'L5');
    const res = await fetch(userinfoUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new ZeniError('L5', res.status, `userinfo failed: ${res.statusText}`);
    }
    return res.json() as Promise<{
      sub: string;
      email: string;
      name: string;
      phone_number?: string;
      role?: string;
    }>;
  },
};
