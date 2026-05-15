/**
 * Personalize — Chairman rule moi: 90% ca nhan hoa + ZERO collision
 *
 * Threshold cuong che:
 *   - SDXL strength      >= 0.9   (ve moi 90%, giu <=10% ref)
 *   - ControlNet weight   = 0.3   (giu it layout ref)
 *   - pHash dist vs ref   >= 35   (~55% bit khac biet)
 *   - CLIP sim vs ref     < 0.4   (semantic rat khac ref)
 *   - CLIP sim vs ALL existing outputs DB  < 0.85  (cross-user zero collision)
 *
 * Workflow:
 *   1) Generate seed unique tu (dna_id + render_id + timestamp_us)
 *   2) Render qua provider
 *   3) Compute CLIP embedding output
 *   4) Query design_outputs.clip_embedding ALL -> max cosine
 *   5) Neu max sim > 0.85 -> reject, regenerate voi seed moi (max 3 lan)
 *   6) Save design_outputs + log collision_rejects
 */
import { createHash } from 'crypto';
import { exec, query } from './db.js';
import { uid } from './uid.js';
import type { PoolRef } from './imagepool.js';
import type { CollisionVerdict, DesignOutput } from '../types.js';

// =====================================================
// CHAIRMAN THRESHOLD (LOCKED 2026-05-15)
// =====================================================
export const MIN_STRENGTH = 0.9;                       // was 0.7
export const CONTROLNET_WEIGHT = 0.3;                  // was 0.5
export const MIN_PHASH_DISTANCE_REF = 35;              // was 25
export const MAX_CLIP_SIMILARITY_REF = 0.4;            // was 0.7
export const MAX_CLIP_SIMILARITY_CROSS = 0.85;         // NEW: cross-user
export const MAX_REGEN_ATTEMPTS = 3;                   // NEW

export interface PersonalizationVerdict {
  output_image_url: string;
  ref_used: PoolRef;
  strength_used: number;
  phash_distance: number;
  clip_similarity_ref: number;
  verified_ref: boolean;
  fail_reason?: string;
}

// =====================================================
// SEED GENERATION — duy nhat per (dna_id, render_id, time)
// =====================================================
export function generateSeed(opts: {
  dna_id: string;
  design_id: string;
  output_index: number;
  attempt?: number;
}): number {
  const ts = process.hrtime.bigint();          // nanosecond timestamp
  const raw = `${opts.dna_id}|${opts.design_id}|${opts.output_index}|${opts.attempt ?? 0}|${ts}`;
  const hex = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  return parseInt(hex, 16) % 2147483647;       // int32 positive
}

// =====================================================
// COSINE SIMILARITY giua 2 vector float32 (CLIP 512-D)
// =====================================================
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function bufferToFloat32(buf: Buffer): Float32Array {
  // SQLite BLOB -> Buffer -> Float32Array (raw bytes)
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

// =====================================================
// CROSS-COLLISION CHECK
// Query ALL existing design_outputs, compute max cosine
// Zero collision = max < 0.85
// =====================================================
export function checkCrossCollision(opts: {
  new_embedding: Float32Array;
  attempt: number;
  exclude_design_id?: string;
}): CollisionVerdict {
  const rows = query<{ id: string; clip_embedding: Buffer | null }>(
    `SELECT id, clip_embedding FROM design_outputs
       WHERE clip_embedding IS NOT NULL
       ${opts.exclude_design_id ? 'AND design_id != ?' : ''}
       ORDER BY created_at DESC LIMIT 50000`,
    opts.exclude_design_id ? [opts.exclude_design_id] : []
  );

  let maxSim = 0;
  let collidedWith: string | undefined;
  for (const row of rows) {
    if (!row.clip_embedding) continue;
    const existing = bufferToFloat32(row.clip_embedding);
    const sim = cosineSimilarity(opts.new_embedding, existing);
    if (sim > maxSim) {
      maxSim = sim;
      collidedWith = row.id;
    }
    if (sim >= 0.99) break;                    // exact match, early stop
  }

  return {
    passed: maxSim < MAX_CLIP_SIMILARITY_CROSS,
    max_cross_similarity: maxSim,
    collided_with: maxSim >= MAX_CLIP_SIMILARITY_CROSS ? collidedWith : undefined,
    attempts_used: opts.attempt,
    reason: maxSim >= MAX_CLIP_SIMILARITY_CROSS
      ? `CLIP cross-similarity ${maxSim.toFixed(3)} >= ${MAX_CLIP_SIMILARITY_CROSS}`
      : undefined,
  };
}

// =====================================================
// SAVE OUTPUT FINGERPRINT vao design_outputs
// =====================================================
export function saveDesignOutput(opts: {
  design_id: string;
  user_id: string;
  dna_id: string;
  output_url: string;
  output_index: number;
  view_kind?: string;
  embedding: Float32Array;
  phash: string;
  seed: number;
  strength: number;
  controlnet_weight: number;
  stage_count: number;
  collision_attempts: number;
  max_cross_similarity: number;
  passed: boolean;
}): string {
  const id = uid('do');
  exec(
    `INSERT INTO design_outputs
       (id, design_id, user_id, dna_id, output_url, view_kind, output_index,
        clip_embedding, phash, render_seed, strength_used, controlnet_weight,
        stage_count, collision_attempts, max_cross_similarity, collision_check_passed,
        created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, opts.design_id, opts.user_id, opts.dna_id,
      opts.output_url, opts.view_kind ?? null, opts.output_index,
      float32ToBuffer(opts.embedding), opts.phash,
      opts.seed, opts.strength, opts.controlnet_weight,
      opts.stage_count, opts.collision_attempts,
      opts.max_cross_similarity, opts.passed ? 1 : 0,
      new Date().toISOString(),
    ]
  );
  return id;
}

// =====================================================
// LOG COLLISION REJECT
// =====================================================
export function logCollisionReject(opts: {
  design_id: string;
  rejected_url: string;
  collided_with?: string;
  cross_similarity: number;
  seed_used: number;
  attempt_number: number;
  reason: string;
}): void {
  const id = uid('cr');
  exec(
    `INSERT INTO collision_rejects
       (id, design_id, rejected_url, collided_with, cross_similarity,
        seed_used, attempt_number, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, opts.design_id, opts.rejected_url, opts.collided_with ?? null,
      opts.cross_similarity, opts.seed_used, opts.attempt_number,
      opts.reason, new Date().toISOString(),
    ]
  );
}

// =====================================================
// LEGACY API (giu cho ai.ts cu hoat dong)
// =====================================================
export function verifyPersonalization(opts: {
  output_image_url: string;
  ref_used: PoolRef;
  strength_used: number;
  phash_distance: number;
  clip_similarity: number;
}): PersonalizationVerdict {
  const reasons: string[] = [];
  if (opts.strength_used < MIN_STRENGTH) reasons.push(`strength ${opts.strength_used} < ${MIN_STRENGTH}`);
  if (opts.phash_distance < MIN_PHASH_DISTANCE_REF) reasons.push(`pHash ${opts.phash_distance} < ${MIN_PHASH_DISTANCE_REF}`);
  if (opts.clip_similarity > MAX_CLIP_SIMILARITY_REF) reasons.push(`CLIP-ref ${opts.clip_similarity} > ${MAX_CLIP_SIMILARITY_REF}`);
  return {
    output_image_url: opts.output_image_url,
    ref_used: opts.ref_used,
    strength_used: opts.strength_used,
    phash_distance: opts.phash_distance,
    clip_similarity_ref: opts.clip_similarity,
    verified_ref: reasons.length === 0,
    fail_reason: reasons.length > 0 ? reasons.join('; ') : undefined,
  };
}

export function logPoolRef(opts: {
  design_id: string;
  verdict: PersonalizationVerdict;
  controlnet_type?: 'edge' | 'depth' | 'pose';
  controlnet_weight?: number;
}): void {
  const id = uid('pref');
  const now = new Date().toISOString();
  exec(
    `INSERT INTO design_pool_refs
      (id, design_id, ref_image_id, ref_source, ref_url, ref_license,
       strength_used, controlnet_type, controlnet_weight,
       phash_distance, clip_similarity, verified_above_70_percent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, opts.design_id,
      opts.verdict.ref_used.ref_image_id,
      opts.verdict.ref_used.source,
      opts.verdict.ref_used.url,
      opts.verdict.ref_used.license,
      opts.verdict.strength_used,
      opts.controlnet_type ?? null,
      opts.controlnet_weight ?? CONTROLNET_WEIGHT,
      opts.verdict.phash_distance,
      opts.verdict.clip_similarity_ref,
      opts.verdict.verified_ref ? 1 : 0,
      now,
    ]
  );
}

export function updateDesignPersonalization(opts: {
  design_id: string;
  verdicts: PersonalizationVerdict[];
}): void {
  const total = opts.verdicts.length;
  if (total === 0) return;
  const allAbove = opts.verdicts.every((v) => v.verified_ref) ? 1 : 0;
  const minStrength = Math.min(...opts.verdicts.map((v) => v.strength_used));
  const avgPers =
    opts.verdicts.reduce((s, v) => s + (1 - v.clip_similarity_ref), 0) / total;
  exec(
    `UPDATE designs SET refs_count = ?, min_strength = ?, all_above_70 = ?,
       personalization_score = ? WHERE id = ?`,
    [total, minStrength, allAbove, avgPers, opts.design_id]
  );
}
