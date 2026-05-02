import { z } from 'zod';

/**
 * Validate moi env var khi server start.
 * Neu thieu hoac sai dinh dang -> process.exit(1) ngay,
 * tranh chay len production roi crash o request dau tien.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  // Session / JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phai >= 32 ky tu'),
  SESSION_COOKIE_NAME: z.string().default('vct_sess'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('https://vietcontech.com,http://localhost:8765')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  // Lop 02 — Data Lake
  ZENI_L2_BASE_URL: z.string().url(),
  ZENI_L2_API_KEY: z.string().min(1),
  ZENI_L2_SCHEMA: z.string().default('viet_contech'),

  // Lop 03 — AI Engine
  ZENI_L3_BASE_URL: z.string().url(),
  ZENI_L3_API_KEY: z.string().min(1),
  ZENI_L3_MODEL: z.string().default('sd-lora-interior'),
  ZENI_L3_STORAGE_BUCKET: z.string().default('viet-contech-uploads'),
  ZENI_L3_STORAGE_BASE_URL: z.string().url(),

  // Lop 04 — Event Bus
  ZENI_L4_BASE_URL: z.string().url(),
  ZENI_L4_API_KEY: z.string().min(1),

  // Connectors
  ZALO_OA_ID: z.string().optional(),
  ZALO_OA_ACCESS_TOKEN: z.string().optional(),
  VNPAY_TMN_CODE: z.string().optional(),
  VNPAY_HASH_SECRET: z.string().optional(),
  VNPAY_ENDPOINT: z.string().url().optional(),
  VNPAY_RETURN_URL: z.string().url().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SALES_NOTIFY_EMAIL: z.string().email().optional(),

  // Lop 05 — SSO OIDC
  ZENI_L5_BASE_URL: z.string().url(),
  ZENI_L5_CLIENT_ID: z.string().min(1),
  ZENI_L5_CLIENT_SECRET: z.string().min(1),
  ZENI_L5_REDIRECT_URI: z.string().url(),
  ZENI_L5_AUTHORIZE_URL: z.string().url(),
  ZENI_L5_TOKEN_URL: z.string().url(),
  ZENI_L5_USERINFO_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Log structured (KHONG log secret value)
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      code: i.code,
      message: i.message,
    }));
    console.log(
      JSON.stringify({
        level: 'fatal',
        msg: 'env validation failed',
        issues,
        ts: new Date().toISOString(),
      })
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
