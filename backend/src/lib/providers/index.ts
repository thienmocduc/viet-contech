/**
 * Provider abstract — chuyen giua MOCK va REAL theo env.PROVIDER_MODE.
 *
 * MOCK: tat ca external call tra response gia (cho dev local, khong can credentials)
 * REAL: goi Zeni Cloud + Zalo OA + VNPay + SendGrid + Google/Zalo SSO that
 */
import { env } from '../../env.js';
import * as mockProviders from './mock.js';
import * as realProviders from './real.js';

const useReal = env.PROVIDER_MODE === 'real';

export const ai = useReal ? realProviders.ai : mockProviders.ai;
export const zalo = useReal ? realProviders.zalo : mockProviders.zalo;
export const vnpay = useReal ? realProviders.vnpay : mockProviders.vnpay;
export const email = useReal ? realProviders.email : mockProviders.email;
export const sso = useReal ? realProviders.sso : mockProviders.sso;

export class ProviderNotConfigured extends Error {
  constructor(provider: string) {
    super(`Provider ${provider} chua duoc cau hinh cho REAL mode (cap nhat lib/providers/real.ts)`);
    this.name = 'ProviderNotConfigured';
  }
}
