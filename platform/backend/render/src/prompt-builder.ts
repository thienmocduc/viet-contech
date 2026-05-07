/**
 * Prompt engineering cho 9 phong cach noi that x 7 phong x 8 goc x cung menh.
 *
 * Prompt template cuoi cung:
 *   [STYLE_DNA], [ROOM_TYPE_LAYOUT], [CAMERA_ANGLE_HINT],
 *   [NGU_HANH_COLOR], [LIGHTING], [QUALITY_TAGS], [WATERMARK_HINT]
 *
 * Negative prompt: chung cho moi style — chong people / text / blur / distort.
 */

import type {
  Style, RoomType, CameraAngle, CungMenh, NguHanh, Quality,
} from './types.js';

// ============================================================
// 9 STYLE DNA — moi style 1 paragraph chuyen sau cho LoRA
// ============================================================
export const STYLE_PROMPTS: Record<Style, string> = {
  luxury:
    'Marble Carrara floor with veined patterns, gold trim ceiling moldings, ' +
    'crystal chandelier with cascading prisms, double-height ceiling 6m, ' +
    'Italian leather Chesterfield sofa, hand-knotted Persian rug, ornate ' +
    'plaster moldings, warm 2700K lighting, gold-leaf accent walls, ' +
    'photorealistic interior architecture, ultra-detailed, 8k',

  indochine:
    'Dong Duong colonial style, gỗ teak with patina, gạch bông Phap mosaic ' +
    'tile floor with octagonal patterns, đèn lồng đồng brass lantern, ' +
    'vegetation green walls, woven rattan furniture, French shutters, ' +
    'banana leaf motifs, warm tropical sunset lighting, French-Vietnamese ' +
    'fusion architecture, 1930s Saigon villa atmosphere',

  modern:
    'Concrete raw walls with formwork marks, floor-to-ceiling glass, ' +
    'black powder-coated steel frames, minimalist furniture in oak, ' +
    'central void with skylight, Scandinavian wood accents, cool 4000K ' +
    'recessed lighting, geometric clean lines, Cubic architecture, ' +
    'Tadao Ando influence, brutalist refined',

  walnut:
    'American walnut wood paneling throughout, brushed brass hardware, ' +
    'leather Chesterfield club sofa, marble countertop with brass inlay, ' +
    'floor-to-ceiling library wall with books, smoking lounge atmosphere, ' +
    'warm 2700K with green banker lamps, masculine refined interior, ' +
    'gentleman club aesthetic, Manhattan penthouse vibe',

  neoclassic:
    'Tan co dien crown moldings, fluted Corinthian columns, paneled ' +
    'wainscoting walls cream off-white, herringbone walnut parquet, ' +
    'French Baccarat chandelier, velvet drapes deep emerald, gold-leaf ' +
    'accents on cornices, classical proportions, Versailles palace ' +
    'influence, 18th century French elegance',

  japandi:
    'Japanese-Scandinavian hybrid, light oak floor wide planks, white ' +
    'walls with washi paper texture, low futon bed on tatami, bonsai ' +
    'plants on engawa shelf, paper sliding doors shoji, soft natural ' +
    'lighting through linen curtains, minimal serene atmosphere, ' +
    'wabi-sabi influence with hygge warmth, raw natural materials',

  wabisabi:
    'Imperfect beauty, raw plaster walls with intentional cracks, ' +
    'weathered teak wood with patina, hand-thrown ceramic vases, ' +
    'dried flowers ikebana arrangement, monochromatic earth tones, ' +
    'natural daylight through rice paper, contemplative quiet, asymmetry, ' +
    'kintsugi gold-repaired cracks, Japanese tea house atmosphere',

  minimalism:
    'Pure white walls floor-to-ceiling, single statement piece furniture, ' +
    'hidden flush-mount storage with handle-less doors, no decoration, ' +
    'geometric volumes, indirect cove LED lighting, museum-like quality, ' +
    'less is more philosophy, John Pawson influence, monastic calm, ' +
    'invisible joinery details',

  mediterranean:
    'Whitewashed lime walls textured, terracotta floor tiles handmade, ' +
    'arched doorways with rough plaster, blue and white ceramic Moroccan ' +
    'patterns, wrought iron fixtures, olive wood ceiling beams exposed, ' +
    'sunset Mediterranean amber light, Aegean coastal feel, Santorini ' +
    'island villa, bougainvillea through window',
};

// ============================================================
// Room type layout hint
// ============================================================
export const ROOM_PROMPTS: Record<RoomType, string> = {
  living:   'spacious living room, sofa arrangement L-shape facing TV wall, coffee table center, accent chair, large area rug',
  bedroom:  'master bedroom, king-size bed with upholstered headboard, two nightstands, walk-in closet entry, bedside reading lamps',
  kitchen:  'open kitchen with central island, induction cooktop, range hood, full-height pantry, breakfast bar with stools',
  bathroom: 'master bathroom, freestanding bathtub, walk-in rain shower, double vanity, large mirror, marble tile',
  office:   'home office, large oak desk, ergonomic chair, bookshelves, dual monitor setup, soft task lighting',
  dining:   'dining room, 6-seat dining table, pendant chandelier overhead, sideboard buffet, large artwork wall',
  foyer:    'entrance foyer, console table with mirror, decorative vase, statement chandelier, marble floor with pattern',
};

// ============================================================
// Camera angle prompt fragment
// ============================================================
export const ANGLE_PROMPTS: Record<CameraAngle, string> = {
  front:      'eye-level front-facing camera, symmetrical composition, focal length 24mm wide',
  back:       'reverse angle from rear of room, focal length 35mm, looking back toward entry',
  left:       '45-degree from left side, focal length 35mm, slight up tilt',
  right:      '45-degree from right side, focal length 35mm, slight up tilt',
  corner_ne:  'isometric corner view from north-east, dramatic perspective, focal length 28mm',
  corner_sw:  'isometric corner view from south-west, dramatic perspective, focal length 28mm',
  birds_eye:  'top-down bird-eye view, orthographic-like, showing full furniture layout',
  eye_level:  'wide-angle eye-level perspective, immersive, focal length 18mm, depth-of-field',
};

// ============================================================
// Cung menh → ngu hanh → mau hop (don gian hoa)
// ============================================================
const CUNG_MENH_TO_NGU_HANH: Record<CungMenh, NguHanh> = {
  kham: 'thuy',
  khon: 'tho',
  chan: 'moc',
  ton:  'moc',
  can:  'tho',
  doai: 'kim',
  cangroup: 'kim',
  ly:   'hoa',
  unknown: 'tho',
};

const NGU_HANH_COLORS: Record<NguHanh, string> = {
  kim:  'subtle accents of white, silver, champagne gold, pearl tones',
  moc:  'subtle accents of forest green, jade, olive, soft sage',
  thuy: 'subtle accents of midnight blue, navy, charcoal black, water-blue',
  hoa:  'subtle accents of warm terracotta, burgundy, copper, sunset orange',
  tho:  'subtle accents of warm beige, ochre, taupe, earth brown',
};

export function nguHanhFor(cungMenh: CungMenh): NguHanh {
  return CUNG_MENH_TO_NGU_HANH[cungMenh] ?? 'tho';
}

export function nguHanhColorPrompt(cungMenh: CungMenh): string {
  return NGU_HANH_COLORS[nguHanhFor(cungMenh)];
}

// ============================================================
// Lighting hint by quality
// ============================================================
const LIGHTING_PROMPTS: Record<Quality, string> = {
  preview:    'natural daylight HDRI, soft shadows',
  production: 'photorealistic global illumination, ray-traced reflections, golden hour HDRI, depth of field f/2.8',
};

// ============================================================
// Quality tags
// ============================================================
const QUALITY_TAGS: Record<Quality, string> = {
  preview:    'high detail, sharp focus',
  production: '8k photorealistic, ultra-detailed, octane render quality, architectural digest magazine style, award-winning interior design',
};

// ============================================================
// Watermark hint (Hard constraint trong DNA)
// ============================================================
const WATERMARK_HINT = 'subtle VCT watermark bottom-right corner, opacity 30%';

// ============================================================
// Negative prompt — CHUNG cho moi style (DNA hard constraint)
// ============================================================
export const NEGATIVE_PROMPT =
  'people, person, human, face, hands, text, watermark logo brand, ' +
  'ugly, blurry, low quality, distorted, lowpoly, cartoon, anime, ' +
  'weird perspective, broken furniture, crooked walls, melted geometry, ' +
  'oversaturated, neon, kitsch, plastic look, tilted horizon, ' +
  'IKEA logo, Apple logo, brand logo';

// ============================================================
// Main builder
// ============================================================
export interface BuildPromptOptions {
  style: Style;
  roomType: RoomType;
  angle: CameraAngle;
  cungMenh: CungMenh;
  quality: Quality;
  watermark: boolean;
}

export function buildPrompt(opts: BuildPromptOptions): {
  prompt: string;
  negative_prompt: string;
} {
  const styleDna = STYLE_PROMPTS[opts.style];
  const roomLayout = ROOM_PROMPTS[opts.roomType];
  const cameraHint = ANGLE_PROMPTS[opts.angle];
  const fengShuiColor = nguHanhColorPrompt(opts.cungMenh);
  const lighting = LIGHTING_PROMPTS[opts.quality];
  const qualityTags = QUALITY_TAGS[opts.quality];
  const watermark = opts.watermark ? `, ${WATERMARK_HINT}` : '';

  const prompt =
    `${styleDna}. ${roomLayout}. ${cameraHint}. ` +
    `${fengShuiColor}. ${lighting}. ${qualityTags}${watermark}.`;

  return {
    prompt: prompt.trim(),
    negative_prompt: NEGATIVE_PROMPT,
  };
}

// ============================================================
// Cubemap face prompt (cho 360 walkthrough)
// ============================================================
export type CubemapFace = 'front' | 'back' | 'left' | 'right' | 'up' | 'down';

const CUBEMAP_FACE_HINTS: Record<CubemapFace, string> = {
  front: 'front view of the room, perfectly seamless edge for cubemap',
  back:  'rear view 180-degree opposite, perfectly seamless edge',
  left:  'left wall view 90-degree, perfectly seamless edge',
  right: 'right wall view 90-degree, perfectly seamless edge',
  up:    'ceiling view straight up, perfectly seamless edge',
  down:  'floor view straight down, perfectly seamless edge',
};

export function buildCubemapPrompt(opts: {
  style: Style;
  roomType: RoomType;
  cungMenh: CungMenh;
  face: CubemapFace;
}): { prompt: string; negative_prompt: string } {
  const styleDna = STYLE_PROMPTS[opts.style];
  const roomLayout = ROOM_PROMPTS[opts.roomType];
  const faceHint = CUBEMAP_FACE_HINTS[opts.face];
  const fengShuiColor = nguHanhColorPrompt(opts.cungMenh);
  return {
    prompt: `${styleDna}. ${roomLayout}. ${faceHint}. ${fengShuiColor}. ` +
            `equirectangular cubemap face, no distortion, 8k, photorealistic.`,
    negative_prompt: NEGATIVE_PROMPT + ', visible seams, edge distortion',
  };
}
