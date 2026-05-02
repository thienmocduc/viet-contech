/**
 * Domain types — shared giua route handlers va lib helpers.
 * Khi co schema chinh thuc tu Lop 02, em main thay bang OpenAPI gen.
 */

// ===== Identity =====
export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: 'guest' | 'customer' | 'sale' | 'admin';
  membershipTier?: 'free' | 'silver' | 'gold' | 'platinum';
  createdAt: string; // ISO
}

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: User['role'];
  iat: number;
  exp: number;
}

// ===== Contact form (CTA landing) =====
export interface Contact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  area?: number; // m2
  need?: string; // VD: 'thiet ke noi that', 'xay nha tron goi'
  note?: string;
  source?: string; // utm_source
  createdAt?: string;
}

// ===== Phong thuy =====
export type Gender = 'nam' | 'nu';
export type Cung =
  | 'Khan'
  | 'Khon'
  | 'Chan'
  | 'Ton'
  | 'Khanh'
  | 'Ly'
  | 'Doai'
  | 'Can'
  | 'Cang'
  | 'Ly';
export type Nh = 'Dong tu menh' | 'Tay tu menh';

export interface PhongThuyResult {
  year: number;
  gender: Gender;
  cung: string; // Cung menh (Khan, Ly, Khon...)
  nh: Nh;
  dirs: {
    sinhKhi: string;
    thienY: string;
    dienNien: string;
    phucVi: string;
  };
  bad?: {
    tuyetMenh: string;
    nguQuy: string;
    lucSat: string;
    hoaHai: string;
  };
}

// ===== Booking tu van =====
export interface Booking {
  id?: string;
  userId?: string; // null neu guest
  name: string;
  phone: string;
  email?: string;
  scheduledAt: string; // ISO datetime
  topic: string; // VD: 'tu van thiet ke', 'khao sat cong trinh'
  branch?: string; // chi nhanh
  status?: 'pending' | 'confirmed' | 'done' | 'cancelled';
  createdAt?: string;
}

// ===== AI Design =====
export interface AiDesignRequest {
  roomType: 'phong khach' | 'phong ngu' | 'bep' | 'phong tho' | 'van phong';
  style: string; // VD: 'tan co dien', 'hien dai toi gian'
  cung?: string; // Cung menh user de chon mau hop phong thuy
  nh?: Nh;
}

export interface AiDesignResponse {
  jobId: string;
  uploadedUrl: string;
  results: string[]; // 4 image URLs
  prompt: string;
  createdAt: string;
}

// ===== Dashboard =====
export interface CustomerDashboard {
  user: Pick<User, 'id' | 'email' | 'fullName' | 'membershipTier'>;
  designs: AiDesignResponse[];
  bookings: Booking[];
  membership: {
    tier: User['membershipTier'];
    expiresAt?: string;
    benefits: string[];
  };
}

export interface SaleDashboard {
  user: Pick<User, 'id' | 'email' | 'fullName'>;
  pipeline: {
    stage: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
    count: number;
    value: number; // VND
  }[];
  commissions: {
    period: string; // YYYY-MM
    paid: number;
    pending: number;
  }[];
}

// ===== Membership =====
export interface MembershipUpgradeRequest {
  tier: 'silver' | 'gold' | 'platinum';
  durationMonths: 1 | 3 | 6 | 12;
}

export interface VnpayIntent {
  orderId: string;
  amount: number; // VND
  payUrl: string;
  qrUrl?: string;
  expiresAt: string;
}
