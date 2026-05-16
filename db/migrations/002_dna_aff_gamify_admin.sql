-- =====================================================
-- Viet-Contech | Migration 002 — DNA / Affiliate ext / Gamify / Admin
-- =====================================================
-- Schema cho 4 module:
--   1) DNA — luu DNA Du an cua khach (immutable + addendums)
--   2) Affiliate — referrals + payouts + commission tier
--   3) Gamification — events + points + badges + levels
--   4) Admin — leads pipeline + audit logs
-- =====================================================

-- -----------------------------------------------------
-- 11) DNA_RECORDS — DNA Du an (immutable sau confirm)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS dna_records (
  id              TEXT PRIMARY KEY,             -- VCT-DNA-{ts36}
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  building_type   TEXT NOT NULL,                -- villa_solo / townhouse / apartment / ...
  ctx_json        TEXT NOT NULL,                -- {area, floors, style, family, ...}
  markdown        TEXT NOT NULL,                -- DNA full MD
  addendums_json  TEXT NOT NULL DEFAULT '[]',   -- ["bo sung 1", ...]
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','locked','archived')),
  locked_at       TEXT,                         -- ISO time confirm
  contract_signed TEXT,                         -- HD chinh sua neu can change
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dna_user    ON dna_records(user_id);
CREATE INDEX IF NOT EXISTS idx_dna_status  ON dna_records(status);
CREATE INDEX IF NOT EXISTS idx_dna_created ON dna_records(created_at);

-- -----------------------------------------------------
-- 12) DNA_NOTES — note bo sung sau khi DNA locked (KHONG sua DNA goc)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS dna_notes (
  id          TEXT PRIMARY KEY,
  dna_id      TEXT NOT NULL REFERENCES dna_records(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note        TEXT NOT NULL,
  attached    TEXT,                             -- file path/url
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dnanotes_dna ON dna_notes(dna_id);

-- -----------------------------------------------------
-- 13) AFFILIATE_REFERRALS — quan he gioi thieu (vinh vien)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id            TEXT PRIMARY KEY,
  ref_code      TEXT NOT NULL,                  -- aff_code
  referrer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  email_hint    TEXT,                           -- email khach truoc khi register
  status        TEXT NOT NULL DEFAULT 'registered'
                CHECK (status IN ('registered','consulting','quoted','signed','paid','cancelled')),
  project_value INTEGER NOT NULL DEFAULT 0,     -- VNĐ
  commission    INTEGER NOT NULL DEFAULT 0,     -- VNĐ hoa hong
  commission_rate INTEGER NOT NULL DEFAULT 8,   -- % (3-12 tuy tier)
  paid_at       TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aff_referrer ON affiliate_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_aff_referred ON affiliate_referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_aff_status   ON affiliate_referrals(status);

-- -----------------------------------------------------
-- 14) AFFILIATE_PAYOUTS — yeu cau rut tien
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,               -- VNĐ
  method        TEXT NOT NULL DEFAULT 'bank'
                CHECK (method IN ('bank','momo','zalopay','vnpay')),
  account_info  TEXT,                            -- so TK / sdt / email
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','paid','rejected')),
  note          TEXT,
  created_at    TEXT NOT NULL,
  paid_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_payout_user   ON affiliate_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON affiliate_payouts(status);

-- -----------------------------------------------------
-- 15) GAMIFY_EVENTS — moi action duoc theo doi (signup/refer/design/booking...)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamify_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,                    -- signup / refer / design / booking / payment / share
  points      INTEGER NOT NULL DEFAULT 0,
  meta_json   TEXT,                             -- {project_id, value, etc.}
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gevent_user   ON gamify_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gevent_type   ON gamify_events(event_type);
CREATE INDEX IF NOT EXISTS idx_gevent_created ON gamify_events(created_at);

-- -----------------------------------------------------
-- 16) GAMIFY_BADGES — huy hieu khach kiem duoc
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS gamify_badges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code  TEXT NOT NULL,                    -- first_design / 10_refs / premium_member / phongthuy_master
  awarded_at  TEXT NOT NULL,
  UNIQUE(user_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_badge_user ON gamify_badges(user_id);

-- -----------------------------------------------------
-- 17) LEADS_PIPELINE — admin quan ly lead tu nhieu kenh
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS leads_pipeline (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  source        TEXT NOT NULL DEFAULT 'web'
                CHECK (source IN ('web','chatbot','affiliate','direct','zalo','facebook','google_ads')),
  source_ref    TEXT,                            -- ref aff code / campaign id
  stage         TEXT NOT NULL DEFAULT 'new'
                CHECK (stage IN ('new','consulting','quoted','signed','cancelled')),
  project_type  TEXT,                            -- biệt thự / nhà phố / ...
  project_size  TEXT,                            -- m²
  budget        INTEGER,                         -- VNĐ
  assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  hot_score     INTEGER NOT NULL DEFAULT 0,      -- 0-100 priority
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_stage    ON leads_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_lead_source   ON leads_pipeline(source);
CREATE INDEX IF NOT EXISTS idx_lead_assigned ON leads_pipeline(assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_created  ON leads_pipeline(created_at);

-- -----------------------------------------------------
-- 18) AUDIT_LOGS — log moi hanh dong admin/agent (immutable for compliance)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT NOT NULL,                    -- dna.confirm / lead.update / payout.approve / ...
  target_type TEXT,                             -- dna / lead / user / payout
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
