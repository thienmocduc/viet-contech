import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, maybeAuth, getSession } from '../lib/auth.js';
import { logEvent, getUserGamify, BADGE_RULES, LEVELS } from '../lib/gamify.js';
import { query } from '../lib/db.js';

const gamify = new Hono();

/**
 * POST /api/gamify/event — Ghi nhan 1 event tu FE (share, view, etc.).
 * Body: { type, meta? }
 * Cho phep maybeAuth: neu chua login -> bo qua, khong tinh.
 */
const eventSchema = z.object({
  type: z.string().min(2).max(40),
  meta: z.record(z.unknown()).optional(),
});
gamify.post('/event', maybeAuth, async (c) => {
  const session = getSession(c);
  if (!session?.sub) return c.json({ ok: true, skipped: 'not_logged_in' });
  const body = await c.req.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  const { points, newBadges } = logEvent(session.sub, parsed.data.type, parsed.data.meta ?? {});
  return c.json({ ok: true, points, newBadges });
});

/**
 * GET /api/gamify/me — Tong diem + level + badges + 20 event gan day.
 */
gamify.get('/me', requireAuth, (c) => {
  const session = getSession(c);
  return c.json({ ok: true, ...getUserGamify(session.sub) });
});

/**
 * GET /api/gamify/leaderboard — Top 20 user theo points (real-time).
 */
gamify.get('/leaderboard', (c) => {
  const rows = query<{ user_id: string; total: number; name: string; avatar: string | null }>(
    `SELECT g.user_id, SUM(g.points) AS total, u.name, u.avatar_url AS avatar
     FROM gamify_events g LEFT JOIN users u ON u.id=g.user_id
     GROUP BY g.user_id
     ORDER BY total DESC
     LIMIT 20`,
    []
  );
  const enriched = rows.map((r, idx) => {
    let lvl = LEVELS[0];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (r.total >= LEVELS[i].min) {
        lvl = LEVELS[i];
        break;
      }
    }
    return {
      rank: idx + 1,
      userId: r.user_id,
      name: r.name || 'Anonymous',
      avatar: r.avatar,
      points: r.total,
      level: lvl,
    };
  });
  return c.json({ ok: true, top: enriched });
});

/**
 * GET /api/gamify/catalog — Danh sach tat ca badge + level (de FE render).
 */
gamify.get('/catalog', (c) => {
  return c.json({
    ok: true,
    levels: LEVELS,
    badges: Object.entries(BADGE_RULES).map(([code, r]) => ({
      code,
      label: r.label,
      icon: r.icon,
    })),
  });
});

export default gamify;
