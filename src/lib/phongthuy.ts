/**
 * Tinh cung menh + ngu hanh theo Bat Trach (Lac Viet).
 * Reuse cung logic ben FE de tranh lech ket qua.
 *
 * Quy tac:
 * - Tinh thien-can (sao 1-9, skip 5)
 * - Map cung menh:
 *   Nam: cong tu nam sinh dao chieu; Nu: tru
 * - 8 cung: Khan, Doai, Can, Cang, Khon, Chan, Ton, Ly
 * - Ngu hanh map theo cung: Khan/Doai = Kim, Can/Cang = Thuy, Khon/Cang = Tho, ...
 */
import type { CungMenh, NguHanh, Gender } from '../types.js';

/**
 * Tinh tong cua cac chu so cua so. VD 1985 -> 1+9+8+5 = 23 -> 2+3 = 5
 */
function digitSum(n: number): number {
  let s = 0;
  let x = Math.abs(n);
  while (x > 0) {
    s += x % 10;
    x = Math.floor(x / 10);
  }
  return s > 9 ? digitSum(s) : s;
}

/**
 * Map gia tri sao (1..9, skip 5) sang cung menh.
 * Convention pho bien tai VN.
 */
const STAR_TO_CUNG: Record<number, CungMenh> = {
  1: 'Khan',
  2: 'Khon',
  3: 'Chan',
  4: 'Ton',
  6: 'Cang',
  7: 'Doai',
  8: 'Can',
  9: 'Ly',
};

const CUNG_TO_NGUHANH: Record<CungMenh, NguHanh> = {
  Khan: 'Thuy', // Khan thuoc Thuy
  Ly: 'Hoa',
  Chan: 'Moc',
  Ton: 'Moc',
  Khon: 'Tho',
  Can: 'Tho',
  Doai: 'Kim',
  Cang: 'Kim',
};

/**
 * Tinh cung menh theo nam sinh + gioi tinh.
 * @param year Nam sinh duong lich (1900-2100)
 * @param gender 'nam' | 'nu'
 */
export function calcCung(year: number, gender: Gender): { cung: CungMenh; nguHanh: NguHanh; star: number } {
  // Tinh tong chu so cua nam: VD 1985 -> 1+9+8+5 = 23 -> 5
  const sumYear = digitSum(year);
  let star: number;
  if (gender === 'nam') {
    // Nam: 11 - sumYear (mod 9, skip 5)
    star = 11 - sumYear;
  } else {
    // Nu: 4 + sumYear (mod 9, skip 5)
    star = 4 + sumYear;
  }
  // Modulo 9, gia tri 0 -> 9
  star = ((star - 1) % 9 + 9) % 9 + 1;
  // skip 5: nam sao 5 -> 2 (Khon), nu sao 5 -> 8 (Can)
  if (star === 5) {
    star = gender === 'nam' ? 2 : 8;
  }
  const cung = STAR_TO_CUNG[star] ?? 'Khan';
  const nguHanh = CUNG_TO_NGUHANH[cung];
  return { cung, nguHanh, star };
}

/**
 * Map cung menh -> palette mau goi y cho AI prompt.
 */
export const CUNG_PALETTE: Record<CungMenh, string> = {
  Khan: 'tone xanh duong, den, ghi (hop Thuy)',
  Ly: 'tone do, cam, hong dat (hop Hoa)',
  Chan: 'tone xanh la, nau go (hop Moc)',
  Ton: 'tone xanh la, xanh duong nhat (hop Moc)',
  Khon: 'tone vang, be, dat nung (hop Tho)',
  Can: 'tone vang dat, nau (hop Tho)',
  Doai: 'tone trang, bac, vang anh kim (hop Kim)',
  Cang: 'tone trang nga, vang nhat, bac (hop Kim)',
};
