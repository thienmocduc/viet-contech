-- =====================================================
-- Viet-Contech | Migration 002 — DNA gia chu + Audit pool refs
-- Yeu cau chairman: KHONG copy nguyen anh kho, MUST cai bien 70%
-- =====================================================

-- -----------------------------------------------------
-- 11) DNA_RECORDS — DNA da chot cua gia chu
-- Bat bien sau khi `confirmed_at` (lock)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS dna_records (
  id              TEXT PRIMARY KEY,                    -- VCT-DNA-{sig}
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- DNA parsed JSON (8 muc: gia chu, lot dat, dia chi, gia dinh, phong cach, phong thuy, ngan sach, dac biet)
  dna_json        TEXT NOT NULL,                       -- JSON dac ta day du
  dna_markdown    TEXT NOT NULL,                       -- ban render Markdown cho gia chu xac nhan

  -- Field rut goc de query nhanh
  area_m2         REAL,
  floors          INTEGER,
  bedrooms        INTEGER,
  space_type      TEXT,                                -- 'biet thu nha vuon' | 'nha pho' | ...
  style           TEXT,                                -- Indochine | Luxury | Modern | Japandi | ...
  year_born       INTEGER,
  gender          TEXT CHECK (gender IN ('nam','nu') OR gender IS NULL),
  cung_menh       TEXT,
  ngu_hanh        TEXT,
  budget_vnd      INTEGER,

  completeness    REAL NOT NULL DEFAULT 0.0,           -- 0-1, do day cua DNA
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','confirmed','locked','archived')),
  confirmed_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dna_user        ON dna_records(user_id);
CREATE INDEX IF NOT EXISTS idx_dna_status      ON dna_records(status);
CREATE INDEX IF NOT EXISTS idx_dna_confirmed   ON dna_records(confirmed_at);

-- -----------------------------------------------------
-- 12) DESIGN_POOL_REFS — audit moi render dung ref tu kho image-Nexbuild
-- Bat buoc: moi design phai co ≥1 row de chung minh khong copy nguyen
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS design_pool_refs (
  id              TEXT PRIMARY KEY,
  design_id       TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,

  -- Reference image trong kho image-Nexbuild (Zeni Cloud)
  ref_image_id    TEXT NOT NULL,                       -- vd: unsplash_a3f2c8e9b1
  ref_source      TEXT NOT NULL,                       -- unsplash | pexels | openimages | ...
  ref_url         TEXT,
  ref_license     TEXT,                                -- preserve cho audit

  -- Tham so cai bien
  strength_used   REAL NOT NULL,                       -- 0-1, BAT BUOC ≥ 0.7
  controlnet_type TEXT,                                -- 'edge' | 'depth' | 'pose' | null
  controlnet_weight REAL,

  -- Verification cai bien
  phash_distance  INTEGER,                             -- Hamming distance output vs ref, BAT BUOC ≥ 25
  clip_similarity REAL,                                -- cosine, BAT BUOC < 0.7
  verified_above_70_percent INTEGER NOT NULL DEFAULT 0
                  CHECK (verified_above_70_percent IN (0,1)),

  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pool_refs_design   ON design_pool_refs(design_id);
CREATE INDEX IF NOT EXISTS idx_pool_refs_ref      ON design_pool_refs(ref_image_id);
CREATE INDEX IF NOT EXISTS idx_pool_refs_verified ON design_pool_refs(verified_above_70_percent);

-- -----------------------------------------------------
-- 13) Mo rong bang DESIGNS — link DNA + add field cai bien
-- -----------------------------------------------------
ALTER TABLE designs ADD COLUMN dna_id TEXT REFERENCES dna_records(id) ON DELETE SET NULL;
ALTER TABLE designs ADD COLUMN personalization_score REAL DEFAULT 0.0;   -- 0-1, do ca nhan hoa
ALTER TABLE designs ADD COLUMN refs_count INTEGER DEFAULT 0;             -- so anh kho da dung
ALTER TABLE designs ADD COLUMN min_strength REAL DEFAULT 0.0;            -- min strength qua tat ca refs
ALTER TABLE designs ADD COLUMN all_above_70 INTEGER DEFAULT 0;           -- 1 neu moi ref >=70% cai bien

CREATE INDEX IF NOT EXISTS idx_designs_dna             ON designs(dna_id);
CREATE INDEX IF NOT EXISTS idx_designs_personalization ON designs(personalization_score);
