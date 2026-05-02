import { Hono } from 'hono';
import { z } from 'zod';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { env } from '../env.js';
import {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  getSession,
} from '../lib/auth.js';
import { sso } from '../lib/providers/index.js';
import { db, queryOne, exec } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import type { User, AuthProvider } from '../types.js';
import { rateLimit } from '../lib/ratelimit.js';

const auth = new Hono();

// Rate limit cho SSO start/callback (10 req/phut/IP)
auth.use('/sso/*', rateLimit({ key: 'sso', max: 10, windowMs: 60_000 }));

const startSchema = z.object({
  provider: z.enum(['google', 'zalo', 'zeni']),
});

/**
 * POST /api/auth/sso/start
 * Body { provider }
 * Sinh state random + luu vao cookie short-lived, tra authorizeUrl cho FE redirect.
 */
auth.post('/sso/start', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: 'bad_request', message: 'Provider khong hop le', issues: parsed.error.issues },
      400
    );
  }
  const state = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  const redirectUri = `${env.FRONTEND_URL.replace(/\/$/, '')}/api/auth/sso/callback`;
  // Cookie state HttpOnly + 10 phut, dung de chong CSRF
  setCookie(c, 'vct_oauth_state', `${parsed.data.provider}:${state}`, {
    httpOnly: true,
    secure: env.NODE_ENV !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  try {
    const authorizeUrl = sso.getAuthorizeUrl({
      provider: parsed.data.provider,
      state,
      redirectUri,
    });
    return c.json({ ok: true, authorizeUrl });
  } catch (err) {
    return c.json(
      {
        error: 'sso_unavailable',
        message: err instanceof Error ? err.message : 'SSO khong san sang',
      },
      503
    );
  }
});

/**
 * GET /api/auth/sso/callback?provider=&code=&state=
 * Doi code lay user info, upsert vao DB, sign session JWT, set cookie, redirect ve FE.
 */
auth.get('/sso/callback', async (c) => {
  const provider = c.req.query('provider');
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!provider || !code || !state) {
    return c.json({ error: 'bad_request', message: 'Thieu provider/code/state' }, 400);
  }
  if (provider !== 'google' && provider !== 'zalo' && provider !== 'zeni') {
    return c.json({ error: 'bad_request', message: 'Provider khong hop le' }, 400);
  }

  // Verify state cookie de chong CSRF
  const stateCookie = getCookie(c, 'vct_oauth_state');
  if (!stateCookie || stateCookie !== `${provider}:${state}`) {
    return c.json({ error: 'csrf_mismatch', message: 'State khong khop, vui long thu lai' }, 400);
  }
  deleteCookie(c, 'vct_oauth_state', { path: '/' });

  const redirectUri = `${env.FRONTEND_URL.replace(/\/$/, '')}/api/auth/sso/callback`;

  try {
    const { user: profile } = await sso.exchangeCode({
      provider,
      code,
      redirectUri,
    });

    // Upsert user theo (provider, provider_uid) hoac email
    const now = new Date().toISOString();
    const existing = queryOne<User>(
      `SELECT * FROM users WHERE (provider = ? AND provider_uid = ?) OR email = ? LIMIT 1`,
      [profile.provider, profile.providerUid, profile.email]
    );

    let userId: string;
    let userRole: User['role'];
    if (existing) {
      userId = existing.id;
      userRole = existing.role;
      exec(
        `UPDATE users SET name = ?, avatar_url = ?, provider = ?, provider_uid = ?, updated_at = ? WHERE id = ?`,
        [
          profile.name || existing.name,
          profile.avatar ?? existing.avatar_url ?? null,
          profile.provider as AuthProvider,
          profile.providerUid,
          now,
          userId,
        ]
      );
    } else {
      userId = uid('usr');
      userRole = 'customer';
      exec(
        `INSERT INTO users (id, email, name, avatar_url, role, provider, provider_uid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          profile.email,
          profile.name,
          profile.avatar,
          userRole,
          profile.provider as AuthProvider,
          profile.providerUid,
          now,
          now,
        ]
      );
    }

    const token = await signSession({ id: userId, email: profile.email, role: userRole });
    setSessionCookie(c, token);

    // Redirect ve FE voi flag login=success
    const target = `${env.FRONTEND_URL}${env.FRONTEND_URL.includes('?') ? '&' : '?'}login=success`;
    return c.redirect(target, 302);
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'auth.sso_callback_failed',
        provider,
        error: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      })
    );
    const target = `${env.FRONTEND_URL}${env.FRONTEND_URL.includes('?') ? '&' : '?'}login=error`;
    return c.redirect(target, 302);
  }
});

/**
 * GET /api/auth/me — full profile + member info
 */
auth.get('/me', requireAuth, async (c) => {
  const session = getSession(c);
  const user = queryOne<User>(`SELECT * FROM users WHERE id = ? LIMIT 1`, [session.sub]);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: 'unauthorized', message: 'User khong ton tai' }, 401);
  }
  const member = queryOne<{
    id: string;
    plan: string;
    status: string;
    started_at: string;
    expires_at: string | null;
  }>(
    `SELECT id, plan, status, started_at, expires_at FROM members WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
    [session.sub]
  );
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      role: user.role,
      provider: user.provider,
      created_at: user.created_at,
    },
    member: member ?? { plan: 'free', status: 'active' },
  });
});

/**
 * POST /api/auth/logout
 */
auth.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// Giu /callback cu (POST) cho FE da implement khi truoc, redirect sang flow moi.
auth.post('/callback', async (c) => {
  return c.json({
    error: 'deprecated',
    message: 'Su dung GET /api/auth/sso/callback?provider=&code=&state= thay vi POST /callback',
  }, 410);
});

export default auth;
