import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import type { SessionPayload, User } from '../types.js';

/**
 * Mo rong context Hono de TypeScript hieu key 'session'.
 */
declare module 'hono' {
  interface ContextVariableMap {
    session: SessionPayload;
  }
}

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Ky session JWT (HS256) cho user — luu trong httpOnly cookie.
 */
export async function signSession(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + env.SESSION_TTL_SECONDS)
    .setIssuer('viet-contech-backend')
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { issuer: 'viet-contech-backend' });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return {
      sub: payload.sub,
      email: payload.email as string,
      role: (payload.role as User['role']) ?? 'guest',
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Set cookie session — httpOnly, secure (production), SameSite=Lax.
 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: env.SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, env.SESSION_COOKIE_NAME, { path: '/' });
}

/**
 * Hono middleware: bat buoc co session hop le.
 * Gan c.set('session', payload) de handler dung.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const token = getCookie(c, env.SESSION_COOKIE_NAME);
  if (!token) {
    return c.json({ error: 'unauthorized', message: 'Thieu cookie session' }, 401);
  }
  const session = await verifySession(token);
  if (!session) {
    return c.json({ error: 'unauthorized', message: 'Session khong hop le hoac da het han' }, 401);
  }
  c.set('session', session);
  await next();
}

/**
 * Optional auth — co session thi gan, khong co thi cu next().
 */
export async function maybeAuth(c: Context, next: Next): Promise<void> {
  const token = getCookie(c, env.SESSION_COOKIE_NAME);
  if (token) {
    const session = await verifySession(token);
    if (session) c.set('session', session);
  }
  await next();
}

/**
 * Helper lay session tu context (trong handler da qua requireAuth).
 */
export function getSession(c: Context): SessionPayload {
  const s = c.get('session');
  if (!s) throw new Error('getSession() goi ngoai requireAuth middleware');
  return s;
}

/**
 * Lay session khi route dung maybeAuth (co the undefined).
 */
export function getOptionalSession(c: Context): SessionPayload | undefined {
  return c.get('session');
}
