-- =====================================================
-- Viet-Contech | SEED data — du lieu mock cho dev
-- =====================================================
-- Ngay tao tu 2026-04-25 toi 2026-05-02 cho realistic.
-- ID dung dang ngan, fix cung de query test de.
-- =====================================================

-- -----------------------------------------------------
-- 1) USERS: 8 nguoi (1 admin, 4 customer, 2 designer/agent, 1 sale)
-- -----------------------------------------------------
INSERT INTO users (id, email, name, phone, avatar_url, role, provider, provider_uid, created_at, updated_at) VALUES
  ('usr_admin01', 'duong@vietcontech.com',  'Le Van Duong',     '0901234567', NULL, 'admin',    'password', NULL, '2026-04-25T08:00:00Z', '2026-04-25T08:00:00Z'),
  ('usr_cust01',  'an.nguyen@gmail.com',    'Nguyen Van An',    '0912345678', NULL, 'customer', 'google',   'g-cust01', '2026-04-25T09:10:00Z', '2026-04-25T09:10:00Z'),
  ('usr_cust02',  'binh.tran@gmail.com',    'Tran Thi Binh',    '0923456789', NULL, 'customer', 'google',   'g-cust02', '2026-04-26T10:20:00Z', '2026-04-26T10:20:00Z'),
  ('usr_cust03',  'cuong.le@gmail.com',     'Le Quoc Cuong',    '0934567890', NULL, 'customer', 'zalo',     'z-cust03', '2026-04-27T14:30:00Z', '2026-04-27T14:30:00Z'),
  ('usr_cust04',  'dung.pham@gmail.com',    'Pham My Dung',     '0945678901', NULL, 'customer', 'password', NULL,       '2026-04-28T11:45:00Z', '2026-04-28T11:45:00Z'),
  ('usr_des01',   'hoa.designer@vietcontech.com', 'Vu Thi Hoa', '0956789012', NULL, 'agent',    'password', NULL,       '2026-04-25T08:30:00Z', '2026-04-25T08:30:00Z'),
  ('usr_des02',   'minh.designer@vietcontech.com','Hoang Quang Minh','0967890123',NULL,'agent', 'password', NULL,       '2026-04-25T08:31:00Z', '2026-04-25T08:31:00Z'),
  ('usr_sale01',  'lan.sale@vietcontech.com','Bui Thi Lan',    '0978901234', NULL, 'sale',     'password', NULL,       '2026-04-25T08:32:00Z', '2026-04-25T08:32:00Z');

-- -----------------------------------------------------
-- 2) AFFILIATES: 3 user co ref_code (admin + 2 customer chu dong)
-- -----------------------------------------------------
INSERT INTO affiliates (id, user_id, ref_code, total_clicks, total_signups, total_revenue_vnd, total_commission_vnd, created_at) VALUES
  ('aff_001', 'usr_admin01', 'VCT-A001', 142, 12, 156000000, 15600000, '2026-04-25T08:00:00Z'),
  ('aff_002', 'usr_cust01',  'VCT-A002',  37,  3,  24000000,  2400000, '2026-04-26T09:00:00Z'),
  ('aff_003', 'usr_cust02',  'VCT-A003',  18,  1,   8000000,   800000, '2026-04-27T10:00:00Z');

-- -----------------------------------------------------
-- 3) CONTACTS: 12 leads, da trang thai (new -> won)
-- -----------------------------------------------------
INSERT INTO contacts (id, name, phone, email, area, need, note, source, status, created_at, assigned_to) VALUES
  ('cnt_001', 'Tran Quang Hai',   '0901111001', 'hai.tq@gmail.com',     85,  'thiet ke noi that',     'Can bao gia chi tiet',          'fb_ads',  'new',         '2026-04-28T08:15:00Z', NULL),
  ('cnt_002', 'Nguyen Thi Mai',   '0901111002', 'mai.nguyen@gmail.com', 120, 'xay nha tron goi',      'Mong nhan duoc tu van som',     'google',  'new',         '2026-04-28T09:20:00Z', NULL),
  ('cnt_003', 'Le Van Tien',      '0901111003', NULL,                    65,  'thiet ke noi that',     NULL,                            'zalo',    'contacted',   '2026-04-28T11:00:00Z', 'usr_sale01'),
  ('cnt_004', 'Pham Thi Hoa',     '0901111004', 'hoa.pham@yahoo.com',    95,  'thiet ke + thi cong',   'Da xem mau, can hen kao sat',   'fb_ads',  'contacted',   '2026-04-29T10:30:00Z', 'usr_sale01'),
  ('cnt_005', 'Dang Quoc Toan',   '0901111005', 'toan.dq@gmail.com',     150, 'xay nha tron goi',      'Yeu cau bao gia 3 tang',         'referral','proposed',    '2026-04-29T14:00:00Z', 'usr_sale01'),
  ('cnt_006', 'Vu Thi Lan Anh',   '0901111006', 'lananh@gmail.com',      78,  'thiet ke noi that',     'Style tan co dien',              'fb_ads',  'proposed',    '2026-04-30T09:15:00Z', 'usr_sale01'),
  ('cnt_007', 'Bui Minh Hieu',    '0901111007', 'hieu.bui@gmail.com',    110, 'xay nha tron goi',      'Da gui hop dong nhap',          'google',  'negotiating', '2026-04-30T15:45:00Z', 'usr_sale01'),
  ('cnt_008', 'Hoang Thi Nga',    '0901111008', NULL,                    60,  'phong thuy + thiet ke', NULL,                            'zalo',    'negotiating', '2026-05-01T08:30:00Z', 'usr_sale01'),
  ('cnt_009', 'Nguyen Quang Vinh','0901111009', 'vinh.ng@gmail.com',     200, 'biet thu tron goi',     'Da ky hop dong giai doan 1',     'referral','won',         '2026-05-01T10:00:00Z', 'usr_sale01'),
  ('cnt_010', 'Tran Thi Thu',     '0901111010', 'thu.tran@gmail.com',    75,  'thiet ke noi that',     'Da thanh toan dat coc',         'fb_ads',  'won',         '2026-05-01T13:20:00Z', 'usr_sale01'),
  ('cnt_011', 'Le Hong Phuc',     '0901111011', 'phuc.le@gmail.com',     90,  'thiet ke noi that',     'Khach huy do thay doi ke hoach','google',  'lost',        '2026-05-02T09:00:00Z', 'usr_sale01'),
  ('cnt_012', 'Pham Van Khoa',    '0901111012', NULL,                    55,  'thiet ke noi that',     'Khach im lang khong phan hoi',   'fb_ads',  'lost',        '2026-05-02T11:30:00Z', 'usr_sale01');

-- -----------------------------------------------------
-- 4) DESIGNS: 5 yeu cau render AI (cung menh khac nhau)
-- -----------------------------------------------------
INSERT INTO designs (id, user_id, title, room_type, style, year_born, gender, cung_menh, ngu_hanh, prompt, image_url, results_json, status, created_at) VALUES
  ('dsg_001', 'usr_cust01', 'Phong khach hien dai',     'phong khach', 'hien dai toi gian', 1990, 'nam', 'Khan',  'Moc',  'Modern minimalist living room, neutral wood tones', NULL, '["https://cdn.vietcontech.com/d/001/r1.jpg","https://cdn.vietcontech.com/d/001/r2.jpg"]', 'done',       '2026-04-29T10:00:00Z'),
  ('dsg_002', 'usr_cust02', 'Phong ngu tan co dien',    'phong ngu',   'tan co dien',       1992, 'nu',  'Doai',  'Kim',  'Neo-classic master bedroom, gold accents',         NULL, '["https://cdn.vietcontech.com/d/002/r1.jpg"]',                                              'done',       '2026-04-30T09:30:00Z'),
  ('dsg_003', 'usr_cust03', 'Bep theo phong thuy',      'bep',         'scandinavian',      1988, 'nam', 'Ly',    'Hoa',  'Scandinavian kitchen, warm fire-element accents',  NULL, '["https://cdn.vietcontech.com/d/003/r1.jpg","https://cdn.vietcontech.com/d/003/r2.jpg","https://cdn.vietcontech.com/d/003/r3.jpg"]', 'done', '2026-05-01T14:00:00Z'),
  ('dsg_004', 'usr_cust04', 'Phong tho gia tien',       'phong tho',   'truyen thong',      1985, 'nu',  'Khon',  'Tho',  'Traditional Vietnamese ancestor altar room',       NULL, NULL,                                                                                          'processing', '2026-05-02T08:15:00Z'),
  ('dsg_005', 'usr_cust01', 'Van phong tai gia',        'van phong',   'industrial',        1990, 'nam', 'Khan',  'Moc',  'Industrial home office with green plants',         NULL, NULL,                                                                                          'pending',    '2026-05-02T10:45:00Z');

-- -----------------------------------------------------
-- 5) BOOKINGS: 8 lich (4 confirmed, 2 pending, 2 done)
-- -----------------------------------------------------
INSERT INTO bookings (id, user_id, type, scheduled_at, duration_min, designer_id, status, note, created_at) VALUES
  ('bk_001', 'usr_cust01', 'style',     '2026-05-03T09:00:00Z', 60, 'usr_des01', 'confirmed', 'Tu van style cho phong khach',         '2026-04-29T10:30:00Z'),
  ('bk_002', 'usr_cust02', 'review',    '2026-05-03T14:00:00Z', 45, 'usr_des02', 'confirmed', 'Review ban ve giai doan 1',            '2026-04-30T11:00:00Z'),
  ('bk_003', 'usr_cust03', 'phongthuy', '2026-05-04T10:00:00Z', 60, 'usr_des01', 'confirmed', 'Tu van phong thuy theo cung Ly',       '2026-05-01T15:00:00Z'),
  ('bk_004', 'usr_cust04', 'quote',     '2026-05-05T15:00:00Z', 30, 'usr_des02', 'confirmed', 'Bao gia thiet ke phong tho',           '2026-05-02T09:30:00Z'),
  ('bk_005', 'usr_cust02', 'style',     '2026-05-06T10:00:00Z', 60, NULL,        'pending',   'Cho phan cong designer',                '2026-05-02T11:00:00Z'),
  ('bk_006', 'usr_cust04', 'phongthuy', '2026-05-07T14:00:00Z', 45, NULL,        'pending',   'Cho xac nhan lich',                     '2026-05-02T13:00:00Z'),
  ('bk_007', 'usr_cust01', 'review',    '2026-04-28T09:00:00Z', 45, 'usr_des01', 'done',      'Da review xong, khach hai long',        '2026-04-26T16:00:00Z'),
  ('bk_008', 'usr_cust03', 'quote',     '2026-04-29T15:00:00Z', 30, 'usr_des02', 'done',      'Bao gia da gui qua zalo',               '2026-04-28T08:00:00Z');

-- -----------------------------------------------------
-- 6) MEMBERS: 3 goi (1 free, 1 premium, 1 vip)
-- -----------------------------------------------------
INSERT INTO members (id, user_id, plan, started_at, expires_at, status, vnpay_txn_ref) VALUES
  ('mem_001', 'usr_cust01', 'free',     '2026-04-25T09:10:00Z', NULL,                     'active', NULL),
  ('mem_002', 'usr_cust02', 'premium',  '2026-04-26T10:30:00Z', '2027-04-26T10:30:00Z',   'active', 'VNP-20260426-7281'),
  ('mem_003', 'usr_cust03', 'vip',      '2026-04-27T14:40:00Z', '2027-04-27T14:40:00Z',   'active', 'VNP-20260427-9183');

-- -----------------------------------------------------
-- 7) PAYMENTS: 6 giao dich (5 vnpay success, 1 bank pending)
-- -----------------------------------------------------
INSERT INTO payments (id, user_id, amount_vnd, currency, gateway, gateway_txn, status, purpose, ref_id, created_at) VALUES
  ('pay_001', 'usr_cust02',   1990000, 'VND', 'vnpay',         'VNP-20260426-7281', 'success', 'membership',     'mem_002', '2026-04-26T10:25:00Z'),
  ('pay_002', 'usr_cust03',   4990000, 'VND', 'vnpay',         'VNP-20260427-9183', 'success', 'membership',     'mem_003', '2026-04-27T14:35:00Z'),
  ('pay_003', 'usr_cust01',    500000, 'VND', 'vnpay',         'VNP-20260429-3142', 'success', 'design_credit',  'dsg_001', '2026-04-29T10:05:00Z'),
  ('pay_004', 'usr_cust02',    500000, 'VND', 'vnpay',         'VNP-20260430-5567', 'success', 'design_credit',  'dsg_002', '2026-04-30T09:35:00Z'),
  ('pay_005', 'usr_cust03',    300000, 'VND', 'vnpay',         'VNP-20260501-7821', 'success', 'consult',        'bk_003',  '2026-05-01T14:50:00Z'),
  ('pay_006', 'usr_cust04',  10000000, 'VND', 'bank_transfer', NULL,                'pending', 'project_deposit','cnt_010', '2026-05-02T11:15:00Z');

-- -----------------------------------------------------
-- 8) PHONGTHUY_LOGS: 8 ban ghi (5 user + 3 anonymous)
-- -----------------------------------------------------
INSERT INTO phongthuy_logs (id, user_id, year_born, gender, cung_menh, ngu_hanh, ip, ua, created_at) VALUES
  ('pt_001', 'usr_cust01', 1990, 'nam', 'Khan',  'Moc',  '113.161.10.5',  'Mozilla/5.0',                             '2026-04-29T09:00:00Z'),
  ('pt_002', 'usr_cust02', 1992, 'nu',  'Doai',  'Kim',  '113.161.20.8',  'Mozilla/5.0',                             '2026-04-30T08:30:00Z'),
  ('pt_003', 'usr_cust03', 1988, 'nam', 'Ly',    'Hoa',  '113.161.30.12', 'Mozilla/5.0',                             '2026-05-01T10:00:00Z'),
  ('pt_004', 'usr_cust04', 1985, 'nu',  'Khon',  'Tho',  '113.161.40.20', 'Mozilla/5.0',                             '2026-05-02T07:45:00Z'),
  ('pt_005', 'usr_cust01', 1990, 'nam', 'Khan',  'Moc',  '113.161.10.5',  'Mozilla/5.0 Mobile',                      '2026-05-02T09:30:00Z'),
  ('pt_006', NULL,         1995, 'nu',  'Can',   'Kim',  '14.241.50.33',  'Mozilla/5.0 (iPhone)',                    '2026-04-30T16:00:00Z'),
  ('pt_007', NULL,         1980, 'nam', 'Chan',  'Moc',  '14.241.60.44',  'Mozilla/5.0 (Android)',                   '2026-05-01T18:20:00Z'),
  ('pt_008', NULL,         1993, 'nu',  'Ton',   'Moc',  '14.241.70.55',  'Mozilla/5.0 (Macintosh)',                 '2026-05-02T12:00:00Z');
