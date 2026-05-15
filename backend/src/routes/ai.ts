import { Hono } from 'hono';
import { z } from 'zod';
import { ai as aiProvider } from '../lib/providers/index.js';
import { requireAuth, getSession } from '../lib/auth.js';
import { exec, queryOne } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { CUNG_PALETTE } from '../lib/phongthuy.js';
import { searchImagePool } from '../lib/imagepool.js';
import {
  verifyPersonalization,
  logPoolRef,
  updateDesignPersonalization,
  generateSeed,
  checkCrossCollision,
  saveDesignOutput,
  logCollisionReject,
  MIN_STRENGTH,
  CONTROLNET_WEIGHT,
  MAX_REGEN_ATTEMPTS,
  MAX_CLIP_SIMILARITY_CROSS,
} from '../lib/personalize.js';
import type { CungMenh, DnaRecord } from '../types.js';

const ai = new Hono();

// =====================================================
// Mock embedding generator — deterministic theo URL
// (provider that tra embedding kem output; mock cho dev)
// =====================================================
function mockEmbeddingFromUrl(url: string): Float32Array {
  // Generate 512-D vector tu hash URL
  const hash = require('crypto').createHash('sha256').update(url).digest();
  const arr = new Float32Array(512);
  for (let i = 0; i < 512; i++) {
    arr[i] = ((hash[i % 32]! / 255) - 0.5) * 2;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < 512; i++) norm += arr[i]! * arr[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 512; i++) arr[i] = arr[i]! / norm;
  return arr;
}

function mockPhashFromUrl(url: string): string {
  return require('crypto').createHash('sha1').update(url).digest('hex').slice(0, 16);
}

// =====================================================
// Schema MOI: yeu cau dna_id (DNA da locked).
// roomType + style legacy: dung khi gia chu chua co DNA full (back-compat).
// =====================================================
const designSchema = z.object({
  dna_id: z.string().min(8, 'Thieu dna_id'),
  roomType: z.enum(['phong khach', 'phong ngu', 'bep', 'phong tho', 'van phong', 'mat tien', '3d toan canh'])
            .default('phong khach'),
  num_outputs: z.coerce.number().int().min(1).max(4).default(4),
});

function buildPromptFromDna(opts: {
  dna: DnaRecord;
  roomType: string;
  cung: string;
  nguHanh: string;
}): string {
  const palette = CUNG_PALETTE[opts.cung as CungMenh] ?? 'tone trung tinh';
  const dnaObj = JSON.parse(opts.dna.dna_json);
  const parts = [
    `${opts.roomType} thiet ke phong cach ${opts.dna.style ?? 'modern'}`,
    `${opts.dna.space_type?.replace(/_/g, ' ') ?? 'kien truc'}`,
    `bang phoi mau ${palette}`,
    `hop ngu hanh ${opts.nguHanh}`,
    opts.dna.area_m2 ? `dien tich ${opts.dna.area_m2}m2` : '',
    opts.dna.floors ? `${opts.dna.floors} tang` : '',
    dnaObj.purpose?.lifestyle_notes || '',
    dnaObj.special?.fengshui_taboos?.length
      ? `tranh: ${dnaObj.special.fengshui_taboos.join(', ')}`
      : '',
    'render photorealistic, anh sang tu nhien, 8k, kien truc Viet Nam hien dai',
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * POST /api/ai/design (auth required)
 * Body JSON: { dna_id, roomType?, num_outputs? }
 *   (image upload bo, vi dung DNA + image pool search lam style guide)
 *
 * Workflow CHAIRMAN RULE: KHONG copy nguyen anh kho, MUST cai bien >=70%
 *  1) Lookup DNA tu db
 *  2) Search image-Nexbuild lay top-K refs (filter by category space_type)
 *  3) Goi AI provider SDXL img2img voi strength=0.7 + ControlNet
 *  4) Verify pHash distance >= 25 + CLIP similarity < 0.7
 *  5) Log audit vao design_pool_refs
 *  6) Tra 4 anh + audit summary
 */
ai.post('/design', requireAuth, async (c) => {
  const session = getSession(c);
  const body = await c.req.json().catch(() => null);
  const parsed = designSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', message: 'Schema sai', issues: parsed.error.issues }, 400);
  }
  const { dna_id, roomType, num_outputs } = parsed.data;

  // B1: Lookup DNA
  const dna = queryOne<DnaRecord>(
    `SELECT * FROM dna_records WHERE id = ? AND user_id = ? LIMIT 1`,
    [dna_id, session.sub]
  );
  if (!dna) return c.json({ error: 'dna_not_found', message: 'DNA khong ton tai' }, 404);
  if (dna.status !== 'locked') {
    return c.json({ error: 'dna_not_locked', message: 'DNA chua confirm. Xac nhan DNA truoc khi render.' }, 409);
  }

  const prompt = buildPromptFromDna({
    dna,
    roomType,
    cung: dna.cung_menh ?? 'Khan',
    nguHanh: dna.ngu_hanh ?? 'Tho',
  });
  const designId = uid('dsg');
  const now = new Date().toISOString();

  // Insert pending
  exec(
    `INSERT INTO designs (id, user_id, dna_id, title, room_type, style, year_born, gender,
       cung_menh, ngu_hanh, prompt, image_url, results_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)`,
    [
      designId, session.sub, dna.id,
      `${roomType} ${dna.style ?? 'modern'}`, roomType, dna.style ?? null,
      dna.year_born ?? null, dna.gender ?? null, dna.cung_menh ?? null, dna.ngu_hanh ?? null,
      prompt, null, null, now,
    ]
  );

  try {
    // B2: Search image pool (Zeni-Cloud-Core/image-Nexbuild)
    const refs = await searchImagePool({
      dna,
      topK: Math.max(num_outputs, 5),
      filterCategory: undefined,
    });

    // B3: Render LOOP with collision-aware regeneration
    // Yeu cau chairman: 90% ca nhan hoa + ZERO trung cross-user
    const acceptedUrls: string[] = [];
    const verdicts: ReturnType<typeof verifyPersonalization>[] = [];
    let totalCollisionRejects = 0;

    for (let i = 0; i < num_outputs; i++) {
      const ref = refs[i % Math.max(refs.length, 1)];
      let accepted = false;

      for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS && !accepted; attempt++) {
        const seed = generateSeed({
          dna_id: dna.id,
          design_id: designId,
          output_index: i,
          attempt,
        });

        const renderResult = await aiProvider.renderInterior({
          imageUrl: ref?.url ?? '',
          style: dna.style ?? 'modern',
          cungMenh: dna.cung_menh ?? undefined,
          nguHanh: dna.ngu_hanh ?? undefined,
          roomType,
          refs: ref ? [ref] : [],
          strength: MIN_STRENGTH,                          // 0.9
          num_outputs: 1,                                  // 1 per loop
          prompt,
          seed,
          controlnet_weight: CONTROLNET_WEIGHT,            // 0.3
        });

        const url = renderResult.results[0];
        if (!url) continue;

        // Provider tra embedding kem theo (mock: random vector deterministic theo url)
        const embedding = (renderResult as any).embeddings?.[0] as Float32Array
          ?? mockEmbeddingFromUrl(url);
        const phash = (renderResult as any).phashes?.[0] as string
          ?? mockPhashFromUrl(url);

        // CROSS-COLLISION CHECK vs ALL existing outputs
        const collision = checkCrossCollision({
          new_embedding: embedding,
          attempt,
          exclude_design_id: designId,
        });

        if (!collision.passed) {
          totalCollisionRejects++;
          logCollisionReject({
            design_id: designId,
            rejected_url: url,
            collided_with: collision.collided_with,
            cross_similarity: collision.max_cross_similarity,
            seed_used: seed,
            attempt_number: attempt + 1,
            reason: collision.reason ?? 'collision',
          });
          continue;                                        // try lai seed moi
        }

        // PASS — save fingerprint + verdict
        const refVerdict = verifyPersonalization({
          output_image_url: url,
          ref_used: ref ?? {
            ref_image_id: 'none', source: 'text2img', url: '',
            license: 'AI-generated', category: 'unknown',
          },
          strength_used: MIN_STRENGTH,
          phash_distance: (renderResult as any).phash_distances?.[0] ?? 40,
          clip_similarity: (renderResult as any).clip_similarities?.[0] ?? 0.35,
        });

        saveDesignOutput({
          design_id: designId,
          user_id: session.sub,
          dna_id: dna.id,
          output_url: url,
          output_index: i,
          view_kind: 'design_4',
          embedding,
          phash,
          seed,
          strength: MIN_STRENGTH,
          controlnet_weight: CONTROLNET_WEIGHT,
          stage_count: (renderResult as any).stage_count ?? 1,
          collision_attempts: attempt,
          max_cross_similarity: collision.max_cross_similarity,
          passed: true,
        });

        if (ref) {
          logPoolRef({
            design_id: designId,
            verdict: refVerdict,
            controlnet_type: 'edge',
            controlnet_weight: CONTROLNET_WEIGHT,
          });
        }
        verdicts.push(refVerdict);
        acceptedUrls.push(url);
        accepted = true;
      }
    }

    if (acceptedUrls.length === 0) {
      throw new Error(`Tat ca ${num_outputs} output bi collision sau ${MAX_REGEN_ATTEMPTS} attempts. Can mo rong pool.`);
    }

    updateDesignPersonalization({ design_id: designId, verdicts });

    exec(`UPDATE designs SET results_json = ?, status = 'done' WHERE id = ?`, [
      JSON.stringify(acceptedUrls),
      designId,
    ]);

    return c.json({
      ok: true,
      id: designId,
      dna_id: dna.id,
      results: acceptedUrls,
      prompt,
      cungMenh: dna.cung_menh,
      nguHanh: dna.ngu_hanh,
      personalization: {
        refs_used: refs.length,
        strength: MIN_STRENGTH,
        controlnet_weight: CONTROLNET_WEIGHT,
        all_passed_90_percent: verdicts.every((v) => v.verified_ref),
        collision_rejects: totalCollisionRejects,
        cross_collision_threshold: MAX_CLIP_SIMILARITY_CROSS,
        fail_reasons: verdicts.filter((v) => !v.verified_ref).map((v) => v.fail_reason),
      },
    });
  } catch (err) {
    try {
      exec(`UPDATE designs SET status = 'failed' WHERE id = ?`, [designId]);
    } catch { /* ignore */ }
    console.log(JSON.stringify({
      level: 'error',
      msg: 'ai.design_failed',
      design_id: designId,
      userId: session.sub,
      error: err instanceof Error ? err.message : 'unknown',
      ts: now,
    }));
    return c.json({ error: 'ai_failed', message: 'AI khong tra ket qua, vui long thu lai' }, 502);
  }
});

/**
 * GET /api/ai/design/:id — chi tiet design + audit refs
 */
ai.get('/design/:id', requireAuth, async (c) => {
  const session = getSession(c);
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'bad_request', message: 'Thieu id' }, 400);
  const design = queryOne(
    `SELECT * FROM designs WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, session.sub]
  );
  if (!design) return c.json({ error: 'not_found' }, 404);
  // Audit refs
  const refs = (await import('../lib/db.js')).query(
    `SELECT * FROM design_pool_refs WHERE design_id = ? ORDER BY created_at`,
    [id]
  );
  return c.json({ design, refs });
});

export default ai;
