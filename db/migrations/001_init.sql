-- =====================================================
-- Viet-Contech | Migration 001 — Khoi tao schema goc
-- =====================================================
-- Tat ca id deu UUID text (gen by app), *_at deu TEXT ISO 8601
-- Schema viet kieu Postgres-compatible (CHECK CONSTRAINT thay cho ENUM)
-- de sau swap sang `pg` cho production khong phai sua nhieu.
-- =====================================================

-- -----------------------------------------------------
-- 1) USERS — nguoi dung he thong (customer/agent/sale/aff/supplier/admin)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  phone         TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer','agent','sale','aff','supplier','admin')),
  provider      TEXT NOT NULL DEFAULT 'password'
                CHECK (provider IN ('zeni','google','zalo','password')),
  provider_uid  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_provider  ON users(provider, provider_uid);

-- -----------------------------------------------------
-- 2) SESSIONS — phien dang nhap (token co han, IP, UA)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token    ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON sessions(expires_at);

-- -----------------------------------------------------
-- 3) CONTACTS — leads tu form CTA (sales pipeline)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  area         REAL,            -- m2
  need         TEXT,            -- vd: 'thiet ke noi that', 'xay tron goi'
  note         TEXT,
  source       TEXT,            -- utm_source / 'fb_ads' / 'google'
  status       TEXT NOT NULL DEFAULT 'new'
               CHECK (status IN ('new','contacted','proposed','negotiating','won','lost')),
  created_at   TEXT NOT NULL,
  assigned_to  TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_status     ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned   ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_phone      ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_created    ON contacts(created_at);

-- -----------------------------------------------------
-- 4) DESIGNS — yeu cau render AI noi that (kem phong thuy)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS designs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  title         TEXT,
  room_type     TEXT,
  style         TEXT,
  year_born     INTEGER,
  gender        TEXT CHECK (gender IN ('nam','nu') OR gender IS NULL),
  cung_menh     TEXT,           -- Khan, Ly, Khon, ...
  ngu_hanh      TEXT,           -- Kim, Moc, Thuy, Hoa, Tho
  prompt        TEXT,
  image_url     TEXT,           -- anh goc upload (neu co)
  results_json  TEXT,           -- JSON: array URL anh ket qua
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_designs_user     ON designs(user_id);
CREATE INDEX IF NOT EXISTS idx_designs_status   ON designs(status);
CREATE INDEX IF NOT EXISTS idx_designs_created  ON designs(created_at);

-- -----------------------------------------------------
-- 5) BOOKINGS — lich hen tu van (style/review/phongthuy/quote)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL
                CHECK (type IN ('style','review','phongthuy','quote')),
  scheduled_at  TEXT NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 30,
  designer_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','done','cancelled')),
  note          TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_user        ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_designer    ON bookings(designer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status      ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled   ON bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_type        ON bookings(type);

-- -----------------------------------------------------
-- 6) MEMBERS — goi thanh vien (free/premium/vip)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free','premium','vip')),
  started_at      TEXT NOT NULL,
  expires_at      TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','cancelled')),
  vnpay_txn_ref   TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_user     ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_status   ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_plan     ON members(plan);
CREATE INDEX IF NOT EXISTS idx_members_expires  ON members(expires_at);

-- -----------------------------------------------------
-- 7) PAYMENTS — lich su giao dich (vnpay/momo/bank)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  amount_vnd    INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'VND',
  gateway       TEXT NOT NULL
                CHECK (gateway IN ('vnpay','momo','bank_transfer')),
  gateway_txn   TEXT,                          -- ma giao dich tu cong thanh toan
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','success','failed','refunded')),
  purpose       TEXT,                          -- 'membership','design_credit','consult', ...
  ref_id        TEXT,                          -- ID lien quan (vd: members.id, designs.id)
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_user     ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway  ON payments(gateway);
CREATE INDEX IF NOT EXISTS idx_payments_created  ON payments(created_at);

-- -----------------------------------------------------
-- 8) PHONGTHUY_LOGS — log tra cuu phong thuy (user co/khong co tk)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS phongthuy_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  year_born   INTEGER NOT NULL,
  gender      TEXT NOT NULL CHECK (gender IN ('nam','nu')),
  cung_menh   TEXT,
  ngu_hanh    TEXT,
  ip          TEXT,
  ua          TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phongthuy_user     ON phongthuy_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_phongthuy_created  ON phongthuy_logs(created_at);

-- -----------------------------------------------------
-- 9) AFFILIATES — chuong trinh hoa hong gioi thieu (1 user = 1 ref_code)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliates (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  ref_code                 TEXT NOT NULL UNIQUE,
  total_clicks             INTEGER NOT NULL DEFAULT 0,
  total_signups            INTEGER NOT NULL DEFAULT 0,
  total_revenue_vnd        INTEGER NOT NULL DEFAULT 0,
  total_commission_vnd     INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliates_ref_code  ON affiliates(ref_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_user      ON affiliates(user_id);

-- -----------------------------------------------------
-- 10) AFFILIATE_CLICKS — log moi cu click vao link gioi thieu
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id            TEXT PRIMARY KEY,
  affiliate_id  TEXT NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  ref_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  source        TEXT,                            -- 'fb', 'zalo', 'qr', ...
  ip            TEXT,
  ua            TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aff_clicks_aff      ON affiliate_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_user     ON affiliate_clicks(ref_user_id);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_created  ON affiliate_clicks(created_at);
