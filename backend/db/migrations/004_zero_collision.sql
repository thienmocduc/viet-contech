-- =====================================================
-- Viet-Contech | Migration 004 — Zero collision + 90% personalization
-- Chairman rule moi: ca nhan hoa 90% + KHONG trung lap giua moi user
-- =====================================================

-- -----------------------------------------------------
-- 16) DESIGN_OUTPUTS — moi anh output co CLIP embedding
-- de check cross-user collision (output user A khong duoc trung output user B)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS design_outputs (
  id              TEXT PRIMARY KEY,
  design_id       TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dna_id          TEXT NOT NULL REFERENCES dna_records(id) ON DELETE CASCADE,

  output_url      TEXT NOT NULL,
  view_kind       TEXT,                                    -- 'design_4' | 'blueprint_floor_plan' | ...
  output_index    INTEGER NOT NULL DEFAULT 0,              -- 0-3 cho 4 outputs

  -- Fingerprint chong trung
  clip_embedding  BLOB,                                     -- 512 float32 (2048 bytes)
  phash           TEXT,                                     -- 16 char hex (64-bit hash)

  -- Seed + render metadata
  render_seed     INTEGER NOT NULL,                         -- unique seed per render
  strength_used   REAL NOT NULL,                            -- >= 0.9
  controlnet_weight REAL,                                   -- 0.3
  stage_count     INTEGER DEFAULT 1,                        -- multi-stage pipeline

  -- Collision check ket qua
  collision_attempts INTEGER DEFAULT 0,                     -- so lan regenerate vi collision
  max_cross_similarity REAL,                                -- max CLIP cosine vs all existing outputs
  collision_check_passed INTEGER NOT NULL DEFAULT 0
                  CHECK (collision_check_passed IN (0,1)),

  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outputs_design     ON design_outputs(design_id);
CREATE INDEX IF NOT EXISTS idx_outputs_user       ON design_outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_outputs_dna        ON design_outputs(dna_id);
CREATE INDEX IF NOT EXISTS idx_outputs_phash      ON design_outputs(phash);
CREATE INDEX IF NOT EXISTS idx_outputs_passed     ON design_outputs(collision_check_passed);
CREATE INDEX IF NOT EXISTS idx_outputs_created    ON design_outputs(created_at);

-- -----------------------------------------------------
-- 17) COLLISION_REJECTS — log moi lan regen vi collision
-- de monitor + cai thien model sau
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS collision_rejects (
  id              TEXT PRIMARY KEY,
  design_id       TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  rejected_url    TEXT NOT NULL,
  collided_with   TEXT,                                     -- design_outputs.id da co
  cross_similarity REAL NOT NULL,
  seed_used       INTEGER NOT NULL,
  attempt_number  INTEGER NOT NULL,
  reason          TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collision_design   ON collision_rejects(design_id);
CREATE INDEX IF NOT EXISTS idx_collision_created  ON collision_rejects(created_at);
