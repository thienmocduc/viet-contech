-- =====================================================
-- Viet-Contech | Migration 003 — Bo ban ve full stack
-- AI concept: floor plan + elevation + section + 3D
-- KTS finalize: structural + MEP + BOQ (qua agentStudio)
-- =====================================================

-- -----------------------------------------------------
-- 14) BLUEPRINTS — bo ban ve kien truc cho 1 DNA
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS blueprints (
  id              TEXT PRIMARY KEY,                   -- VCT-BP-{sig}
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dna_id          TEXT NOT NULL REFERENCES dna_records(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','generating','ai_done','kts_review','finalized','failed')),

  -- Concept AI sinh
  ai_completed_at TEXT,
  ai_total_views  INTEGER DEFAULT 0,                  -- so view AI da render (floor+elev+section+3D)

  -- KTS finalize (Revit / AutoCAD)
  assigned_kts    TEXT REFERENCES users(id) ON DELETE SET NULL,
  kts_review_at   TEXT,
  finalized_at    TEXT,

  -- Output bundle final (PDF + DWG zip)
  bundle_url      TEXT,                                -- URL Zeni L2 Storage

  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blueprints_user      ON blueprints(user_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_dna       ON blueprints(dna_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_status    ON blueprints(status);
CREATE INDEX IF NOT EXISTS idx_blueprints_kts       ON blueprints(assigned_kts);

-- -----------------------------------------------------
-- 15) BLUEPRINT_ASSETS — moi view la 1 asset (anh / DWG / PDF)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS blueprint_assets (
  id              TEXT PRIMARY KEY,
  blueprint_id    TEXT NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,

  view_kind       TEXT NOT NULL                       -- loai view
                  CHECK (view_kind IN (
                    'floor_plan',                     -- mat bang
                    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
                    'section_xx', 'section_yy',       -- mat cat
                    '3d_exterior', '3d_aerial',       -- 3D ngoai
                    '3d_interior_living', '3d_interior_master', '3d_interior_kitchen',
                    '3d_interior_dining', '3d_interior_office', '3d_interior_bath',
                    'structural_foundation',          -- mong (KTS finalize)
                    'structural_columns',             -- cot
                    'mep_electrical',                 -- dien
                    'mep_plumbing',                   -- nuoc
                    'mep_hvac',                       -- DHKK
                    'boq_summary'                     -- BOQ tom luoc
                  )),

  floor_level     INTEGER,                            -- tang 0=tret, 1=lau 1, ...
  produced_by     TEXT NOT NULL                       -- ai | kts | hybrid
                  CHECK (produced_by IN ('ai','kts','hybrid')),

  asset_url       TEXT NOT NULL,                       -- URL anh / PDF / DWG
  asset_type      TEXT NOT NULL                       -- image | pdf | dwg | rvt
                  CHECK (asset_type IN ('image','pdf','dwg','rvt','json')),
  preview_url     TEXT,                                -- thumbnail neu khac asset_url
  width           INTEGER,
  height          INTEGER,
  file_size       INTEGER,

  -- Audit AI personalization (chi voi produced_by='ai')
  refs_used_count INTEGER DEFAULT 0,                  -- so anh kho image-Nexbuild dung lam ref
  strength_used   REAL,                                -- 0-1
  verified_above_70 INTEGER DEFAULT 0
                  CHECK (verified_above_70 IN (0,1)),

  -- KTS metadata
  kts_notes       TEXT,
  kts_signed_off  INTEGER DEFAULT 0
                  CHECK (kts_signed_off IN (0,1)),

  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp_assets_bp        ON blueprint_assets(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_bp_assets_kind      ON blueprint_assets(view_kind);
CREATE INDEX IF NOT EXISTS idx_bp_assets_producer  ON blueprint_assets(produced_by);
CREATE INDEX IF NOT EXISTS idx_bp_assets_signed    ON blueprint_assets(kts_signed_off);
