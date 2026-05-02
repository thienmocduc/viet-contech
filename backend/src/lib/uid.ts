import crypto from 'node:crypto';

/**
 * Sinh UID time-sortable, an toan, khong can dep nang.
 * - 12 ky tu hex dau = timestamp (ms) -> sap xep theo thoi gian
 * - 16 ky tu hex sau = random 8 bytes
 * - Co the prefix de phan biet entity (vd: 'usr', 'ses', 'cnt')
 *
 * VD: uid('usr') -> 'usr_018f6a2b1c00a1b2c3d4e5f60718'
 */
export function uid(prefix = ''): string {
  const ts = Date.now().toString(16).padStart(12, '0');
  const rnd = crypto.randomBytes(8).toString('hex');
  return (prefix ? prefix + '_' : '') + ts + rnd;
}
