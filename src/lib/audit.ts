import { exec } from './db.js';
import { uid } from './uid.js';
import type { Context } from 'hono';

/**
 * Ghi audit log immutable.
 * Goi trong moi action quan trong (DNA confirm, lead update, payout approve...).
 */
export function audit(
  c: Context | null,
  action: string,
  target: { type?: string; id?: string } = {},
  meta: Record<string, unknown> = {}
): void {
  try {
    const session = (c?.get?.('session') as { sub?: string; email?: string } | undefined) ?? undefined;
    const ip = c?.req?.header('x-forwarded-for')?.split(',')[0]?.trim() || c?.req?.header('x-real-ip') || null;
    const ua = c?.req?.header('user-agent') || null;
    exec(
      `INSERT INTO audit_logs (id, actor_id, actor_email, action, target_type, target_id, meta_json, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid('aud'),
        session?.sub ?? null,
        session?.email ?? null,
        action,
        target.type ?? null,
        target.id ?? null,
        JSON.stringify(meta),
        ip,
        ua,
        new Date().toISOString(),
      ]
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        level: 'warn',
        msg: 'audit.write_failed',
        action,
        error: e instanceof Error ? e.message : 'unknown',
        ts: new Date().toISOString(),
      })
    );
  }
}
