/**
 * Hono API routes cho Render Farm.
 *
 * Endpoints:
 *   POST /api/render/room              — render 1 room 1 style 8 angles
 *   POST /api/render/all-styles        — 9 styles x 8 angles
 *   POST /api/render/360               — 360 panorama walkthrough
 *   GET  /api/render/job/:id           — status + progress 1 job
 *   GET  /api/render/results/:projectId — list all rendered files
 *   GET  /api/render/cost-estimate     — uoc tinh chi phi truoc khi run
 */

import { Hono } from 'hono';
import { RenderFarm } from './render-farm.js';
import { LocalStorageAdapter } from './storage.js';
import { ZeniL3Client } from './zeni-l3-client.js';
import { globalJobRegistry } from './queue.js';
import { ALL_STYLES, ALL_ANGLES, QUALITY_PRESETS, VND_PER_USD } from './types.js';
import type {
  RenderRoomOptions, RenderAllStylesOptions, Walkthrough360Options,
  Style, RoomType, CungMenh, Quality,
} from './types.js';

// ============================================================
// Body validators (light, runtime)
// ============================================================
function isStr(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function asStyle(s: unknown): Style | null {
  return ALL_STYLES.includes(s as Style) ? (s as Style) : null;
}

const ROOM_TYPES: RoomType[] = ['living', 'bedroom', 'kitchen', 'bathroom', 'office', 'dining', 'foyer'];
function asRoomType(s: unknown): RoomType | null {
  return ROOM_TYPES.includes(s as RoomType) ? (s as RoomType) : null;
}

const CUNG_MENH_LIST: CungMenh[] = ['kham', 'khon', 'chan', 'ton', 'can', 'doai', 'cangroup', 'ly', 'unknown'];
function asCungMenh(s: unknown): CungMenh | null {
  return CUNG_MENH_LIST.includes(s as CungMenh) ? (s as CungMenh) : null;
}

function asQuality(s: unknown): Quality | null {
  return s === 'preview' || s === 'production' ? s : null;
}

// ============================================================
// Factory
// ============================================================
export function createRenderApp(opts?: {
  farm?: RenderFarm;
}): Hono {
  const farm = opts?.farm ?? new RenderFarm({
    client: new ZeniL3Client(),
    storage: new LocalStorageAdapter(),
    registry: globalJobRegistry,
  });
  const storage = (farm as unknown as { storage: LocalStorageAdapter }).storage;

  const app = new Hono();

  // ------------------------------------------------------------
  // POST /api/render/room
  // ------------------------------------------------------------
  app.post('/api/render/room', async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid json body' }, 400);

    const projectId = body.projectId ?? body.project_id;
    const roomType = asRoomType(body.roomType ?? body.room_type);
    const style = asStyle(body.style);
    const cungMenh = asCungMenh(body.cung_menh ?? body.cungMenh ?? 'unknown');
    const layout = (body.layout_2d_path as string) ?? '';
    const numAngles = typeof body.num_angles === 'number' ? body.num_angles : 8;
    const quality = asQuality(body.quality) ?? 'preview';

    if (!isStr(projectId) || !roomType || !style || !cungMenh) {
      return c.json({ error: 'required: projectId, roomType, style, cung_menh' }, 400);
    }

    const renderOpts: RenderRoomOptions = {
      projectId,
      roomType,
      style,
      cung_menh: cungMenh,
      layout_2d_path: layout,
      num_angles: numAngles,
      quality,
    };
    const result = await farm.renderRoom(renderOpts);
    return c.json(result);
  });

  // ------------------------------------------------------------
  // POST /api/render/all-styles
  // ------------------------------------------------------------
  app.post('/api/render/all-styles', async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid json body' }, 400);

    const projectId = body.projectId ?? body.project_id;
    const roomType = asRoomType(body.roomType ?? body.room_type);
    const cungMenh = asCungMenh(body.cung_menh ?? body.cungMenh ?? 'unknown');
    const layout = (body.layout_2d_path as string) ?? '';
    const numAngles = typeof body.num_angles === 'number' ? body.num_angles : 8;
    const quality = asQuality(body.quality) ?? 'preview';
    const stylesIn = Array.isArray(body.styles)
      ? body.styles.map(asStyle).filter((s): s is Style => s !== null)
      : ALL_STYLES;

    if (!isStr(projectId) || !roomType || !cungMenh) {
      return c.json({ error: 'required: projectId, roomType, cung_menh' }, 400);
    }

    const renderOpts: RenderAllStylesOptions = {
      projectId,
      roomType,
      cung_menh: cungMenh,
      layout_2d_path: layout,
      num_angles: numAngles,
      quality,
      styles: stylesIn,
    };
    const result = await farm.renderAll9Styles(renderOpts);
    return c.json(result);
  });

  // ------------------------------------------------------------
  // POST /api/render/360
  // ------------------------------------------------------------
  app.post('/api/render/360', async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'invalid json body' }, 400);

    const projectId = body.projectId ?? body.project_id;
    const roomType = asRoomType(body.roomType ?? body.room_type);
    const style = asStyle(body.style);
    const cungMenh = asCungMenh(body.cung_menh ?? body.cungMenh ?? 'unknown');
    const quality = asQuality(body.quality) ?? 'production';

    if (!isStr(projectId) || !roomType || !style || !cungMenh) {
      return c.json({ error: 'required: projectId, roomType, style, cung_menh' }, 400);
    }

    const opts: Walkthrough360Options = {
      projectId,
      roomType,
      style,
      cung_menh: cungMenh,
      quality,
    };
    const result = await farm.render360(opts);
    return c.json(result);
  });

  // ------------------------------------------------------------
  // GET /api/render/job/:id
  // ------------------------------------------------------------
  app.get('/api/render/job/:id', (c) => {
    const id = c.req.param('id');
    const job = globalJobRegistry.getJob(id);
    if (!job) return c.json({ error: 'job not found' }, 404);
    return c.json(job);
  });

  // ------------------------------------------------------------
  // GET /api/render/results/:projectId
  // ------------------------------------------------------------
  app.get('/api/render/results/:projectId', async (c) => {
    const projectId = c.req.param('projectId');
    const files = await storage.list(projectId);
    return c.json({
      project_id: projectId,
      file_count: files.length,
      files,
    });
  });

  // ------------------------------------------------------------
  // GET /api/render/cost-estimate
  // ------------------------------------------------------------
  app.get('/api/render/cost-estimate', (c) => {
    const numRooms = parseInt(c.req.query('num_rooms') ?? '1', 10);
    const numStyles = parseInt(c.req.query('num_styles') ?? '9', 10);
    const numAngles = parseInt(c.req.query('num_angles') ?? '8', 10);
    const include360 = c.req.query('include_360') === 'true';
    const quality = (c.req.query('quality') as Quality) ?? 'preview';

    const spec = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.preview;
    const numFrames = numRooms * numStyles * numAngles;
    const frameUsd = numFrames * spec.cost_usd;
    const pano360Usd = include360 ? numRooms * 6 * spec.cost_usd : 0;
    const totalUsd = frameUsd + pano360Usd;

    return c.json({
      num_rooms: numRooms,
      num_styles: numStyles,
      num_angles: numAngles,
      quality,
      include_360: include360,
      breakdown: {
        room_renders: numFrames,
        room_renders_usd: roundCurrency(frameUsd),
        panorama_360_faces: include360 ? numRooms * 6 : 0,
        panorama_360_usd: roundCurrency(pano360Usd),
      },
      total_images: numFrames + (include360 ? numRooms * 6 : 0),
      total_usd: roundCurrency(totalUsd),
      total_vnd: Math.round(totalUsd * VND_PER_USD),
    });
  });

  return app;
}

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}
