-- =====================================================
-- Viet-Contech | Migration 005 — Affiliate + Gamify + Admin tables
-- =====================================================
-- Cherry-pick tu commit aecee1f (branch deploy-backend) sang main.
-- Bo qua dna_records vi 002_dna_and_audit da co schema cu.
-- 7 bang moi:
--   - dna_notes: bo sung sau khi DNA locked
--   - affiliate_referrals: quan he gioi thieu vinh vien (tier 3/5/8/12%)
--   - affiliate_payouts: yeu cau rut tien (pending/approved/paid/rejected)
--   - gamify_events: event log (signup/refer/design/booking/payment...)
--   - gamify_badges: huy hieu unlock (first_design / dna_master / 5_refs / ...)
--   - leads_pipeline: lead da kenh + 5 stage
--   - audit_logs: immutable audit cho compliance
-- =====================================================

-- -----------------------------------------------------
-- 12) DNA_NOTES — bo sung sau khi DNA locked
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS dna_notes (
  id          TEXT PRIMARY KEY,
  dna_id      TEXT NOT NULL REFERENCES dna_records(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  attached    TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dnanotes_dna ON dna_notes(dna_id);

-- -----------------------------------------------------
-- 13) AFFILIATE_REFERRALS — quan he gioi thieu vinh vien
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id              TEXT PRIMARY KEY,
  referrer_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email_hint      TEXT,
  phone_hint      TEXT,
  ref_code        TEXT NOT NULL,
  source          TEXT,
  utm_source      TEXT,
  utm_campaign    TEXT,
  status          TEXT NOT NULL DEFAULT 'registered'
                  CHECK (status IN ('registered','consulting','quoted','signed','paid','cancelled')),
  project_value   INTEGER DEFAULT 0,
  commission      INTEGER DEFAULT 0,
  commission_rate REAL DEFAULT 0,
  paid_at         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refs_referrer ON affiliate_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_refs_status   ON affiliate_referrals(status);
CREATE INDEX IF NOT EXISTS idx_refs_created  ON affiliate_referrals(created_at);

-- -----------------------------------------------------
-- 14) AFFILIATE_PAYOUTS — yeu cau rut tien
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  method      TEXT NOT NULL DEFAULT 'bank'
              CHECK (method IN ('bank','momo','zalopay')),
  account     TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','approved','paid','rejected')),
  rejected_reason TEXT,
  paid_at     TEXT,
  paid_tx_id  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payout_user   ON affiliate_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON affiliate_payouts(status);

-- -----------------------------------------------------
-- 15) GAMIFY_EVENTS — event log + points
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamify_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  meta_json   TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gevent_user    ON gamify_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gevent_type    ON gamify_events(event_type);
CREATE INDEX IF NOT EXISTS idx_gevent_created ON gamify_events(created_at);

-- -----------------------------------------------------
-- 16) GAMIFY_BADGES — huy hieu unlock
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamify_badges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code  TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  meta_json   TEXT,
  UNIQUE(user_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_badge_user ON gamify_badges(user_id);

-- -----------------------------------------------------
-- 17) LEADS_PIPELINE — lead da kenh
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS leads_pipeline (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  source        TEXT,
  project_type  TEXT,
  area          INTEGER,
  budget        INTEGER,
  hot_score     INTEGER DEFAULT 0,
  stage         TEXT NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new','consulting','quoted','signed','cancelled')),
  assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_stage   ON leads_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_leads_source  ON leads_pipeline(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads_pipeline(created_at);

-- -----------------------------------------------------
-- 18) AUDIT_LOGS — immutable audit
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta_json   TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_target  ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
