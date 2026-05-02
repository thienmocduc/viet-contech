import type { Context, Next } from 'hono';

/**
 * Rate limit don gian theo IP, store in-memory (Map).
 * Phu hop dev/staging. Production swap sang Redis.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function getClientIp(c: Context): string {
  // Hono dung node-server, IP nam o request.headers x-forwarded-for hoac socket
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  // Fallback: dung connectionInfo neu co
  return 'unknown';
}

export interface RateLimitOptions {
  key: string; // route key (vd: 'contact', 'sso')
  max: number; // so request toi da
  windowMs: number; // cua so thoi gian (ms)
}

export function rateLimit(opts: RateLimitOptions) {
  return async function rateLimitMw(c: Context, next: Next): Promise<Response | void> {
    const ip = getClientIp(c);
    const bucketKey = `${opts.key}:${ip}`;
    const now = Date.now();

    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          error: 'rate_limited',
          message: `Qua nhieu yeu cau, vui long thu lai sau ${retryAfter}s`,
        },
        429
      );
    }
    await next();
  };
}

// Cleanup bucket cu (chay moi 5 phut neu process song lau)
setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  },
  5 * 60 * 1000
).unref?.();
