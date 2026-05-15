/**
 * Image Pool — Zeni Cloud image-Nexbuild integration
 * Search semantic anh tu kho image-Nexbuild dua tren DNA gia chu.
 * Tra Top-K refs de SDXL img2img dung lam style guide (strength=0.7).
 */
import { env } from '../env.js';
import type { DnaRecord } from '../types.js';

export interface PoolRef {
  ref_image_id: string;          // unsplash_a3f2c8e9b1
  source: string;                // unsplash | pexels | openimages | ...
  url: string;                   // download URL
  license: string;               // Unsplash License | CC BY 2.0 | ...
  category: string;              // villa_garden | townhouse | ...
  similarity?: number;           // cosine score 0-1
}

/**
 * Search image-Nexbuild bang query text (DNA build prompt).
 * Khi pool chua chay (Phase 1 chua xong) -> tra empty array (degrade gracefully).
 * Khi pool unblock -> goi /v1/search Zeni-Cloud-Core/image-Nexbuild.
 */
export async function searchImagePool(opts: {
  dna: DnaRecord;
  topK?: number;
  filterCategory?: string;       // villa_garden | townhouse | luxury_mansion | office_luxury | architecture_style
}): Promise<PoolRef[]> {
  const k = opts.topK ?? 5;
  const baseUrl = env.IMAGE_POOL_BASE_URL;
  if (!baseUrl) {
    console.log(JSON.stringify({
      level: 'warn',
      msg: 'imagepool.not_configured',
      hint: 'set IMAGE_POOL_BASE_URL khi Zeni-Cloud-Core/image-Nexbuild chay',
    }));
    return [];                                              // degrade: SDXL tu render text-to-image
  }

  // Build query tu DNA
  const q = buildPoolQuery(opts.dna);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${env.IMAGE_POOL_API_KEY ?? ''}`,
        'x-tenant-id': env.TENANT_ID ?? 'viet_contech',
      },
      body: JSON.stringify({
        query: q.text,
        category: opts.filterCategory ?? mapCategory(opts.dna.space_type),
        top_k: k,
        embedding: q.embedding,                             // null khi BE chua co CLIP encoder
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.log(JSON.stringify({ level: 'warn', msg: 'imagepool.search_failed', status: res.status }));
      return [];
    }
    const data = await res.json() as { items: PoolRef[] };
    return data.items ?? [];
  } catch (e) {
    console.log(JSON.stringify({
      level: 'warn',
      msg: 'imagepool.search_error',
      error: e instanceof Error ? e.message : 'unknown',
    }));
    return [];
  }
}

/**
 * Build query text + (optional) embedding tu DNA cho vector search.
 */
function buildPoolQuery(dna: DnaRecord): { text: string; embedding: number[] | null } {
  const parts: string[] = [];
  if (dna.style) parts.push(dna.style);
  if (dna.space_type) parts.push(dna.space_type.replace(/_/g, ' '));
  if (dna.area_m2) parts.push(`${dna.area_m2}m2`);
  if (dna.floors) parts.push(`${dna.floors} tang`);
  if (dna.cung_menh) parts.push(`cung ${dna.cung_menh}`);
  if (dna.ngu_hanh) parts.push(`ngu hanh ${dna.ngu_hanh}`);
  return { text: parts.join(', '), embedding: null };
}

function mapCategory(spaceType?: string | null): string {
  switch (spaceType) {
    case 'biet_thu_nha_vuon': return 'villa_garden';
    case 'nha_pho': return 'townhouse';
    case 'biet_thu_luxury': return 'luxury_mansion';
    case 'office_luxury': return 'office_luxury';
    default: return 'architecture_style';
  }
}
