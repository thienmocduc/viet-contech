import { exec, queryOne, query } from './db.js';
const queryAll = query;
import { uid } from './uid.js';

/**
 * Bang diem cac event:
 *   signup      +50  (lan dau dang ky)
 *   first_login +20
 *   first_dna   +100 (tao DNA dau tien)
 *   dna_confirm +200 (xac nhan DNA — lock)
 *   refer       +100 (gioi thieu ban moi)
 *   refer_paid  +500 (ban duoc gioi thieu thanh toan)
 *   design      +30  (render 1 thiet ke AI)
 *   booking     +40
 *   payment_x10 +10 per 10M VNĐ (thi cong)
 *   share       +5
 *   review_5    +50  (danh gia 5 sao)
 */
export const POINTS: Record<string, number> = {
  signup: 50,
  first_login: 20,
  first_dna: 100,
  dna_confirm: 200,
  refer: 100,
  refer_paid: 500,
  design: 30,
  booking: 40,
  payment: 10, // per 10M VNĐ
  share: 5,
  review_5: 50,
};

/**
 * Level theo total points:
 *   Bronze 0-499
 *   Silver 500-1999
 *   Gold 2000-4999
 *   Platinum 5000-9999
 *   Diamond 10000+
 */
export const LEVELS = [
  { code: 'bronze', label: 'Đồng', min: 0, color: '#CD7F32' },
  { code: 'silver', label: 'Bạc', min: 500, color: '#C0C0C0' },
  { code: 'gold', label: 'Vàng', min: 2000, color: '#D4AF37' },
  { code: 'platinum', label: 'Bạch Kim', min: 5000, color: '#E5E4E2' },
  { code: 'diamond', label: 'Kim Cương', min: 10000, color: '#B9F2FF' },
];

/**
 * Badge unlock rules (auto check sau moi event).
 * key = badge_code, value = (userId) => boolean
 */
export const BADGE_RULES: Record<string, { label: string; icon: string; check: (uid: string) => boolean }> = {
  first_design: {
    label: 'Người thiết kế đầu tiên',
    icon: '🎨',
    check: (u) => !!queryOne(`SELECT 1 FROM gamify_events WHERE user_id=? AND event_type='design' LIMIT 1`, [u]),
  },
  dna_master: {
    label: 'Bậc thầy DNA',
    icon: '🧬',
    check: (u) => !!queryOne(`SELECT 1 FROM gamify_events WHERE user_id=? AND event_type='dna_confirm' LIMIT 1`, [u]),
  },
  '5_refs': {
    label: '5 lượt giới thiệu',
    icon: '🔥',
    check: (u) => {
      const r = queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM affiliate_referrals WHERE referrer_id=?`,
        [u]
      );
      return (r?.c ?? 0) >= 5;
    },
  },
  '10_refs': {
    label: '10 lượt giới thiệu',
    icon: '🏆',
    check: (u) => {
      const r = queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM affiliate_referrals WHERE referrer_id=?`,
        [u]
      );
      return (r?.c ?? 0) >= 10;
    },
  },
  big_spender: {
    label: 'Khách hàng VIP',
    icon: '💎',
    check: (u) => {
      const r = queryOne<{ s: number }>(
        `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE user_id=? AND status='success'`,
        [u]
      );
      return (r?.s ?? 0) >= 1_000_000_000; // 1 tỷ VNĐ
    },
  },
  phongthuy_master: {
    label: 'Bậc thầy phong thủy',
    icon: '☯',
    check: (u) => {
      const r = queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM phongthuy_logs WHERE user_id=?`,
        [u]
      );
      return (r?.c ?? 0) >= 5;
    },
  },
};

/**
 * Ghi 1 gamify event + tu dong tinh diem + check badge unlock moi.
 * Idempotent vi su dung uid moi.
 */
export function logEvent(
  userId: string,
  eventType: string,
  meta: Record<string, unknown> = {}
): { points: number; newBadges: string[] } {
  const points = POINTS[eventType] ?? 0;
  exec(
    `INSERT INTO gamify_events (id, user_id, event_type, points, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uid('ge'), userId, eventType, points, JSON.stringify(meta), new Date().toISOString()]
  );
  const newBadges = checkAndAwardBadges(userId);
  return { points, newBadges };
}

/**
 * Check tat ca badge rules, award nhung badge user chua co.
 * Tra danh sach badge_code moi awarded.
 */
function checkAndAwardBadges(userId: string): string[] {
  const owned = queryAll<{ badge_code: string }>(
    `SELECT badge_code FROM gamify_badges WHERE user_id=?`,
    [userId]
  ).map((r) => r.badge_code);
  const ownedSet = new Set(owned);
  const newOnes: string[] = [];
  for (const [code, rule] of Object.entries(BADGE_RULES)) {
    if (ownedSet.has(code)) continue;
    try {
      if (rule.check(userId)) {
        exec(
          `INSERT INTO gamify_badges (id, user_id, badge_code, awarded_at) VALUES (?, ?, ?, ?)`,
          [uid('bdg'), userId, code, new Date().toISOString()]
        );
        newOnes.push(code);
      }
    } catch {
      /* ignore broken rule */
    }
  }
  return newOnes;
}

export function getUserGamify(userId: string): {
  totalPoints: number;
  level: { code: string; label: string; color: string };
  nextLevel: { code: string; label: string; pointsToNext: number } | null;
  badges: { code: string; label: string; icon: string; awardedAt: string }[];
  events: { type: string; points: number; createdAt: string }[];
} {
  const totalRow = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(points),0) AS total FROM gamify_events WHERE user_id=?`,
    [userId]
  );
  const total = totalRow?.total ?? 0;
  let currentLvl = LEVELS[0];
  let nextLvl: typeof LEVELS[number] | undefined;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (total >= LEVELS[i].min) {
      currentLvl = LEVELS[i];
      nextLvl = LEVELS[i + 1];
      break;
    }
  }
  const badges = queryAll<{ badge_code: string; awarded_at: string }>(
    `SELECT badge_code, awarded_at FROM gamify_badges WHERE user_id=? ORDER BY awarded_at DESC`,
    [userId]
  );
  const events = queryAll<{ event_type: string; points: number; created_at: string }>(
    `SELECT event_type, points, created_at FROM gamify_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return {
    totalPoints: total,
    level: { code: currentLvl.code, label: currentLvl.label, color: currentLvl.color },
    nextLevel: nextLvl
      ? { code: nextLvl.code, label: nextLvl.label, pointsToNext: nextLvl.min - total }
      : null,
    badges: badges.map((b) => {
      const r = BADGE_RULES[b.badge_code];
      return {
        code: b.badge_code,
        label: r?.label ?? b.badge_code,
        icon: r?.icon ?? '🏅',
        awardedAt: b.awarded_at,
      };
    }),
    events: events.map((e) => ({ type: e.event_type, points: e.points, createdAt: e.created_at })),
  };
}
