import { Hono } from 'hono';
import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { env } from '../env.js';
import { exec, queryOne } from '../lib/db.js';
import { uid } from '../lib/uid.js';

const affiliate = new Hono();

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

export default affiliate;
