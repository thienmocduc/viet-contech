import { Hono } from 'hono';
import { z } from 'zod';
import { l5 } from '../lib/zeni.js';
import {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  getSession,
} from '../lib/auth.js';
import type { User } from '../types.js';

const auth = new Hono();

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional(),
});

/**
 * POST /api/auth/callback
 * Frontend gui code (lay tu ?code= cua Zeni SSO) -> exchange access_token
 * -> get userinfo -> ky session JWT -> set httpOnly cookie.
 */
auth.post('/callback', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }

  try {
    const tokens = await l5.exchangeCode(parsed.data.code);
    const profile = await l5.getUserInfo(tokens.access_token);

    // TODO: upsert user vao Lop 02 viet_contech.users (email lookup, neu chua co thi insert)
    const user: Pick<User, 'id' | 'email' | 'role'> = {
      id: profile.sub,
      email: profile.email,
      role: (profile.role as User['role']) ?? 'customer',
    };

    const sessionToken = await signSession(user);
    setSessionCookie(c, sessionToken);

    console.log(JSON.stringify({
      level: 'info',
      msg: 'auth.login',
      userId: user.id,
      role: user.role,
      ts: new Date().toISOString(),
    }));

    return c.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'auth.callback_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'auth_failed', message: 'Khong the dang nhap qua Zeni SSO' }, 502);
  }
});

/**
 * GET /api/auth/me — verify cookie + tra user info.
 */
auth.get('/me', requireAuth, async (c) => {
  const session = getSession(c);
  // TODO: query Lop 02 lay full profile (membershipTier, fullName, phone)
  return c.json({
    user: {
      id: session.sub,
      email: session.email,
      role: session.role,
    },
  });
});

/**
 * POST /api/auth/logout — clear cookie.
 */
auth.post('/logout', async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default auth;
