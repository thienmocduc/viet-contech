import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import type { Database as DbType, Statement } from 'better-sqlite3';

import { env } from '../env.js';

/**
 * DB layer cho Viet-Contech.
 * - Dung better-sqlite3 (sync, file-based, fast) cho dev mode
 * - Tu mkdir folder DB neu chua co
 * - Auto chay migrations on boot tu backend/db/migrations/*.sql theo thu tu
 * - Track applied migrations trong table `_migrations`
 * - Auto-seed neu DB rong (chay backend/db/seed.sql)
 *
 * Schema viet kieu Postgres-compatible (CHECK CONSTRAINT thay cho ENUM)
 * de sau swap sang `pg` cho production khong phai sua nhieu.
 */

// -----------------------------------------------------
// Resolve duong dan tu vi tri file (dist/lib/db.js hoac src/lib/db.ts)
// -----------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// backend/ root: tu dist/lib hoac src/lib len 2 cap
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'db', 'migrations');
const SEED_FILE = path.join(BACKEND_ROOT, 'db', 'seed.sql');

// -----------------------------------------------------
// Resolve DB path (relative -> absolute, tu BACKEND_ROOT)
// -----------------------------------------------------
function resolveDbPath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
}

const DB_FILE = resolveDbPath(env.DB_PATH);

// Tao folder chua DB neu chua co
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// -----------------------------------------------------
// Init Database
// -----------------------------------------------------
export const db: DbType = new Database(DB_FILE);

// Toi uu cho concurrency + bat foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// -----------------------------------------------------
// Migrations runner
// -----------------------------------------------------
function ensureMigrationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    )
  `);
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Theo thu tu ten file: 001_xxx -> 002_xxx -> ...
}

function appliedMigrations(): Set<string> {
  const rows = db.prepare<[], { name: string }>('SELECT name FROM _migrations').all();
  return new Set(rows.map((r) => r.name));
}

function runMigrations(): number {
  ensureMigrationsTable();
  const files = listMigrationFiles();
  const applied = appliedMigrations();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const insertMigration = db.prepare(
      'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
    );
    const apply = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file, new Date().toISOString());
    });
    apply();
    count++;
  }
  return count;
}

// -----------------------------------------------------
// Seed runner — chay neu DB rong (table users co 0 row)
// -----------------------------------------------------
function isFreshDb(): boolean {
  try {
    const row = db
      .prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM users')
      .get();
    return !row || row.c === 0;
  } catch {
    return true;
  }
}

function runSeed(): number {
  if (!fs.existsSync(SEED_FILE)) return 0;
  if (!isFreshDb()) return 0;

  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  const seed = db.transaction(() => {
    db.exec(sql);
  });
  seed();

  // Dem so row insert tu cac bang chinh
  const tables = [
    'users',
    'sessions',
    'contacts',
    'designs',
    'bookings',
    'members',
    'payments',
    'phongthuy_logs',
    'affiliates',
    'affiliate_clicks',
  ];
  let total = 0;
  for (const t of tables) {
    try {
      const row = db
        .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM ${t}`)
        .get();
      total += row?.c ?? 0;
    } catch {
      // Bo qua bang chua ton tai
    }
  }
  return total;
}

// -----------------------------------------------------
// Boot — chay 1 lan khi import module
// -----------------------------------------------------
const migratedCount = runMigrations();
const seededRows = runSeed();

console.log(
  JSON.stringify({
    level: 'info',
    msg: '[DB] migrated ' + migratedCount + ' | seeded ' + seededRows + ' rows',
    db_file: DB_FILE,
    ts: new Date().toISOString(),
  })
);

// -----------------------------------------------------
// Public helpers
// -----------------------------------------------------
type Param = string | number | bigint | Buffer | null;
type Params = Param[] | Record<string, Param>;

/**
 * Query nhieu row. Luon dung prepared statement (khong concat string).
 */
export function query<T = unknown>(sql: string, params: Params = []): T[] {
  const stmt = db.prepare(sql) as Statement<unknown[], T>;
  if (Array.isArray(params)) {
    return stmt.all(...(params as unknown[])) as T[];
  }
  return stmt.all(params as Record<string, unknown>) as T[];
}

/**
 * Query 1 row, tra ve undefined neu khong co.
 */
export function queryOne<T = unknown>(sql: string, params: Params = []): T | undefined {
  const stmt = db.prepare(sql) as Statement<unknown[], T>;
  if (Array.isArray(params)) {
    return stmt.get(...(params as unknown[])) as T | undefined;
  }
  return stmt.get(params as Record<string, unknown>) as T | undefined;
}

/**
 * Exec INSERT/UPDATE/DELETE, tra ve { changes, lastInsertRowid }.
 */
export function exec(
  sql: string,
  params: Params = []
): { changes: number; lastInsertRowid: number | bigint } {
  const stmt = db.prepare(sql);
  const info = Array.isArray(params)
    ? stmt.run(...(params as unknown[]))
    : stmt.run(params as Record<string, unknown>);
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
}

/**
 * Transaction wrapper. Tu dong rollback khi throw.
 *
 * VD:
 *   const result = tx(() => {
 *     exec('INSERT INTO users ...');
 *     exec('INSERT INTO members ...');
 *     return { ok: true };
 *   });
 */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}
