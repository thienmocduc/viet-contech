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

// ===== DNA Records (gia chu chat KTS xong, lock lai) =====
export type DnaStatus = 'draft' | 'confirmed' | 'locked' | 'archived';
export type SpaceType = 'biet_thu_nha_vuon' | 'nha_pho' | 'biet_thu_luxury' | 'office_luxury' | 'kien_truc_khac';

export interface DnaRecord {
  id: string;                          // VCT-DNA-{sig}
  user_id: string;
  dna_json: string;                    // JSON full 8 muc
  dna_markdown: string;
  area_m2?: number | null;
  floors?: number | null;
  bedrooms?: number | null;
  space_type?: SpaceType | null;
  style?: string | null;
  year_born?: number | null;
  gender?: Gender | null;
  cung_menh?: string | null;
  ngu_hanh?: string | null;
  budget_vnd?: number | null;
  completeness: number;                // 0-1
  status: DnaStatus;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ===== AI Design =====
export type DesignStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Design {
  id: string;
  user_id?: string | null;
  dna_id?: string | null;              // link DNA
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
  // Personalization audit
  personalization_score?: number;      // 0-1
  refs_count?: number;
  min_strength?: number;
  all_above_70?: 0 | 1;
}

// ===== Full stack ban ve =====
export type BlueprintStatus = 'pending' | 'generating' | 'ai_done' | 'kts_review' | 'finalized' | 'failed';

export type BlueprintViewKind =
  | 'floor_plan'
  | 'elevation_north' | 'elevation_south' | 'elevation_east' | 'elevation_west'
  | 'section_xx' | 'section_yy'
  | '3d_exterior' | '3d_aerial'
  | '3d_interior_living' | '3d_interior_master' | '3d_interior_kitchen'
  | '3d_interior_dining' | '3d_interior_office' | '3d_interior_bath'
  | 'structural_foundation' | 'structural_columns'
  | 'mep_electrical' | 'mep_plumbing' | 'mep_hvac'
  | 'boq_summary';

export type AssetType = 'image' | 'pdf' | 'dwg' | 'rvt' | 'json';
export type ProducedBy = 'ai' | 'kts' | 'hybrid';

export interface Blueprint {
  id: string;
  user_id: string;
  dna_id: string;
  status: BlueprintStatus;
  ai_completed_at?: string | null;
  ai_total_views: number;
  assigned_kts?: string | null;
  kts_review_at?: string | null;
  finalized_at?: string | null;
  bundle_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueprintAsset {
  id: string;
  blueprint_id: string;
  view_kind: BlueprintViewKind;
  floor_level?: number | null;
  produced_by: ProducedBy;
  asset_url: string;
  asset_type: AssetType;
  preview_url?: string | null;
  width?: number | null;
  height?: number | null;
  file_size?: number | null;
  refs_used_count: number;
  strength_used?: number | null;
  verified_above_70: 0 | 1;
  kts_notes?: string | null;
  kts_signed_off: 0 | 1;
  created_at: string;
}

// ===== Output fingerprint: chong trung CROSS-USER =====
export interface DesignOutput {
  id: string;
  design_id: string;
  user_id: string;
  dna_id: string;
  output_url: string;
  view_kind?: string | null;
  output_index: number;
  clip_embedding?: Buffer | null;        // 512 float32
  phash?: string | null;
  render_seed: number;
  strength_used: number;                  // >= 0.9
  controlnet_weight?: number | null;      // 0.3
  stage_count: number;
  collision_attempts: number;
  max_cross_similarity?: number | null;
  collision_check_passed: 0 | 1;
  created_at: string;
}

export interface CollisionVerdict {
  passed: boolean;
  max_cross_similarity: number;
  collided_with?: string;                 // design_outputs.id
  attempts_used: number;
  reason?: string;
}

// ===== Audit: design dung ref tu kho image-Nexbuild =====
export interface DesignPoolRef {
  id: string;
  design_id: string;
  ref_image_id: string;                // vd: unsplash_a3f2c8e9b1
  ref_source: string;                  // unsplash | pexels | openimages
  ref_url?: string | null;
  ref_license?: string | null;
  strength_used: number;               // BAT BUOC >= 0.7
  controlnet_type?: 'edge' | 'depth' | 'pose' | null;
  controlnet_weight?: number | null;
  phash_distance?: number | null;      // >= 25
  clip_similarity?: number | null;     // < 0.7
  verified_above_70_percent: 0 | 1;
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
