/**
 * Domain types — shared giua route handlers va lib helpers.
 * Cap nhat de match schema migration 001_init.sql.
 */

// ===== Identity =====
export type UserRole = 'customer' | 'agent' | 'sale' | 'aff' | 'supplier' | 'admin';
export type AuthProvider = 'zeni' | 'google' | 'zalo' | 'password';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  provider: AuthProvider;
  provider_uid?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// ===== Contact form (CTA landing) =====
export type ContactStatus = 'new' | 'contacted' | 'proposed' | 'negotiating' | 'won' | 'lost';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  area?: number | null;
  need?: string | null;
  note?: string | null;
  source?: string | null;
  status: ContactStatus;
  created_at: string;
  assigned_to?: string | null;
}

// ===== Phong thuy =====
export type Gender = 'nam' | 'nu';
export type NguHanh = 'Kim' | 'Moc' | 'Thuy' | 'Hoa' | 'Tho';
// Cung menh theo Bat Trach: 8 cung
export type CungMenh = 'Khan' | 'Khon' | 'Chan' | 'Ton' | 'Ly' | 'Doai' | 'Can' | 'Cang';

export interface PhongThuyLog {
  id: string;
  user_id?: string | null;
  year_born: number;
  gender: Gender;
  cung_menh?: string | null;
  ngu_hanh?: string | null;
  ip?: string | null;
  ua?: string | null;
  created_at: string;
}

// ===== Booking tu van =====
export type BookingType = 'style' | 'review' | 'phongthuy' | 'quote';
export type BookingStatus = 'pending' | 'confirmed' | 'done' | 'cancelled';

export interface Booking {
  id: string;
  user_id?: string | null;
  type: BookingType;
  scheduled_at: string;
  duration_min: number;
  designer_id?: string | null;
  status: BookingStatus;
  note?: string | null;
  created_at: string;
}

// ===== AI Design =====
export type DesignStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Design {
  id: string;
  user_id?: string | null;
  title?: string | null;
  room_type?: string | null;
  style?: string | null;
  year_born?: number | null;
  gender?: Gender | null;
  cung_menh?: string | null;
  ngu_hanh?: string | null;
  prompt?: string | null;
  image_url?: string | null;
  results_json?: string | null;
  status: DesignStatus;
  created_at: string;
}

// ===== Membership / Payment =====
export type MemberPlan = 'free' | 'premium' | 'vip';
export type MemberStatus = 'active' | 'expired' | 'cancelled';

export interface Member {
  id: string;
  user_id: string;
  plan: MemberPlan;
  started_at: string;
  expires_at?: string | null;
  status: MemberStatus;
  vnpay_txn_ref?: string | null;
}

export type PaymentGateway = 'vnpay' | 'momo' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  user_id?: string | null;
  amount_vnd: number;
  currency: string;
  gateway: PaymentGateway;
  gateway_txn?: string | null;
  status: PaymentStatus;
  purpose?: string | null;
  ref_id?: string | null;
  created_at: string;
}

// ===== Affiliate =====
export interface Affiliate {
  id: string;
  user_id: string;
  ref_code: string;
  total_clicks: number;
  total_signups: number;
  total_revenue_vnd: number;
  total_commission_vnd: number;
  created_at: string;
}

export interface AffiliateClick {
  id: string;
  affiliate_id: string;
  ref_user_id?: string | null;
  source?: string | null;
  ip?: string | null;
  ua?: string | null;
  created_at: string;
}
