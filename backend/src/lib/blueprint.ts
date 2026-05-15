/**
 * Blueprint orchestrator — sinh full stack ban ve tu DNA gia chu
 *
 * AI sinh (Phase 4A):
 *   - Floor plan moi tang (top-down view)
 *   - 4 mat dung (elevation N/S/E/W)
 *   - 2 mat cat (section X-X, Y-Y)
 *   - 3D exterior + aerial
 *   - 3D interior 5-7 phong theo DNA.purpose.rooms_required
 *
 * KTS finalize (Phase 4B, qua agentStudio):
 *   - Structural drawings (mong, cot, dam, san) — KTS ky ten chung chi
 *   - MEP (dien, nuoc, DHKK) — ky su M&E
 *   - BOQ — Quantity Surveyor
 */
import { ai as aiProvider } from './providers/index.js';
import { searchImagePool } from './imagepool.js';
import { MIN_STRENGTH } from './personalize.js';
import { exec } from './db.js';
import { uid } from './uid.js';
import { CUNG_PALETTE } from './phongthuy.js';
import type {
  DnaRecord,
  BlueprintViewKind,
  BlueprintAsset,
  CungMenh,
} from '../types.js';

// View nao AI lam, view nao KTS lam
export const AI_VIEW_KINDS: BlueprintViewKind[] = [
  'floor_plan',
  'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
  '3d_exterior', '3d_aerial',
  '3d_interior_living', '3d_interior_master', '3d_interior_kitchen',
  '3d_interior_dining',
];

export const KTS_VIEW_KINDS: BlueprintViewKind[] = [
  'structural_foundation', 'structural_columns',
  'mep_electrical', 'mep_plumbing', 'mep_hvac',
  'section_xx', 'section_yy',
  'boq_summary',
];

const PROMPT_BY_VIEW: Record<string, (dna: DnaRecord, dnaObj: any) => string> = {
  floor_plan: (dna) =>
    `architectural floor plan, top-down view, ${dna.area_m2 ?? 200}m2, ${dna.floors ?? 2} floors, ` +
    `${dna.style ?? 'modern'} style, vietnamese architecture, dimensions, room labels, ` +
    `clean line drawing, black and white blueprint style, professional`,

  elevation_north: (dna) =>
    `architectural elevation drawing, north facade, ${dna.style ?? 'modern'} villa, ` +
    `${dna.floors ?? 2} floors, vietnamese architecture, dimensions, technical drawing style`,
  elevation_south: (dna) =>
    `architectural elevation drawing, south facade, ${dna.style ?? 'modern'} villa, ${dna.floors ?? 2} floors`,
  elevation_east: (dna) =>
    `architectural elevation drawing, east facade, ${dna.style ?? 'modern'} villa, ${dna.floors ?? 2} floors`,
  elevation_west: (dna) =>
    `architectural elevation drawing, west facade, ${dna.style ?? 'modern'} villa, ${dna.floors ?? 2} floors`,

  '3d_exterior': (dna) =>
    `photorealistic 3D rendering exterior, ${dna.style ?? 'modern'} ${dna.space_type?.replace(/_/g,' ') ?? 'house'}, ` +
    `${dna.area_m2 ?? 200}m2, ${dna.floors ?? 2} floors, vietnamese context, natural lighting, 8k, detailed landscaping`,
  '3d_aerial': (dna) =>
    `aerial bird-eye view 3D rendering, ${dna.style ?? 'modern'} ${dna.space_type?.replace(/_/g,' ') ?? 'house'} compound, ` +
    `garden, pool, parking, ${dna.area_m2 ?? 200}m2 site, 8k`,

  '3d_interior_living': (dna) => interiorPrompt(dna, 'living room', 'phong khach'),
  '3d_interior_master': (dna) => interiorPrompt(dna, 'master bedroom', 'phong ngu master'),
  '3d_interior_kitchen': (dna) => interiorPrompt(dna, 'modern kitchen', 'bep'),
  '3d_interior_dining': (dna) => interiorPrompt(dna, 'dining room', 'phong an'),
};

function interiorPrompt(dna: DnaRecord, en: string, vi: string): string {
  const palette = CUNG_PALETTE[(dna.cung_menh ?? 'Khan') as CungMenh] ?? 'tone trung tinh';
  return [
    `photorealistic 3D interior rendering, ${en} (${vi})`,
    `${dna.style ?? 'modern'} style, vietnamese context`,
    `color palette: ${palette}`,
    `feng shui ${dna.ngu_hanh ?? 'Tho'} element`,
    `natural lighting, 8k, ultra detailed, architectural photography`,
  ].join(', ');
}

interface AssetInsert {
  blueprint_id: string;
  view_kind: BlueprintViewKind;
  floor_level?: number | null;
  produced_by: 'ai' | 'kts' | 'hybrid';
  asset_url: string;
  asset_type: 'image' | 'pdf' | 'dwg' | 'rvt' | 'json';
  refs_used_count: number;
  strength_used: number;
  verified_above_70: 0 | 1;
}

function insertAsset(a: AssetInsert): string {
  const id = uid('bpa');
  exec(
    `INSERT INTO blueprint_assets
      (id, blueprint_id, view_kind, floor_level, produced_by, asset_url, asset_type,
       refs_used_count, strength_used, verified_above_70, kts_signed_off, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id, a.blueprint_id, a.view_kind, a.floor_level ?? null,
      a.produced_by, a.asset_url, a.asset_type,
      a.refs_used_count, a.strength_used, a.verified_above_70,
      new Date().toISOString(),
    ]
  );
  return id;
}

/**
 * Generate AI views (floor + elevation + 3D). KHONG generate structural/MEP — KTS lam.
 */
export async function generateAiBlueprint(opts: {
  blueprint_id: string;
  dna: DnaRecord;
}): Promise<{ assetIds: string[]; failed: BlueprintViewKind[] }> {
  const { blueprint_id, dna } = opts;
  const dnaObj = JSON.parse(dna.dna_json);
  const refs = await searchImagePool({ dna, topK: 3 });

  // Chon view 3D interior theo phong yeu cau
  const requestedRooms: string[] = dnaObj.purpose?.rooms_required ?? [];
  const wantInterior = new Set<BlueprintViewKind>([
    '3d_interior_living',
    '3d_interior_master',
    '3d_interior_kitchen',
  ]);
  if (requestedRooms.some((r) => /an|dining/i.test(r))) wantInterior.add('3d_interior_dining');

  const viewsToRender: BlueprintViewKind[] = [
    'floor_plan',
    'elevation_north', 'elevation_south', 'elevation_east', 'elevation_west',
    '3d_exterior', '3d_aerial',
    ...Array.from(wantInterior),
  ];

  const assetIds: string[] = [];
  const failed: BlueprintViewKind[] = [];

  for (const view of viewsToRender) {
    const promptFn = PROMPT_BY_VIEW[view];
    if (!promptFn) {
      failed.push(view);
      continue;
    }
    const prompt = promptFn(dna, dnaObj);
    try {
      const out = await aiProvider.renderInterior({
        imageUrl: refs[0]?.url ?? '',
        style: dna.style ?? 'modern',
        cungMenh: dna.cung_menh ?? undefined,
        nguHanh: dna.ngu_hanh ?? undefined,
        roomType: view,
        refs,
        strength: MIN_STRENGTH,
        num_outputs: 1,                        // moi view 1 anh, kts pick
        prompt,
      });
      const url = out.results[0];
      if (!url) {
        failed.push(view);
        continue;
      }
      const aid = insertAsset({
        blueprint_id,
        view_kind: view,
        floor_level: view === 'floor_plan' ? 0 : null,
        produced_by: 'ai',
        asset_url: url,
        asset_type: 'image',
        refs_used_count: refs.length,
        strength_used: out.strength_used ?? MIN_STRENGTH,
        verified_above_70: (out.phash_distances?.[0] ?? 30) >= 25 ? 1 : 0,
      });
      assetIds.push(aid);
    } catch (err) {
      console.log(JSON.stringify({
        level: 'error',
        msg: 'blueprint.view_failed',
        view, blueprint_id,
        error: err instanceof Error ? err.message : 'unknown',
      }));
      failed.push(view);
    }
  }

  // Cap nhat blueprint
  const now = new Date().toISOString();
  exec(
    `UPDATE blueprints SET status = 'ai_done', ai_completed_at = ?, ai_total_views = ?, updated_at = ?
     WHERE id = ?`,
    [now, assetIds.length, now, blueprint_id]
  );

  return { assetIds, failed };
}
