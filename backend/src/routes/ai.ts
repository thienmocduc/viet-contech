import { Hono } from 'hono';
import { z } from 'zod';
import { ai as aiProvider } from '../lib/providers/index.js';
import { requireAuth, getSession } from '../lib/auth.js';
import { exec } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { calcCung, CUNG_PALETTE } from '../lib/phongthuy.js';
import type { CungMenh } from '../types.js';

const ai = new Hono();

const designFieldsSchema = z.object({
  roomType: z.enum(['phong khach', 'phong ngu', 'bep', 'phong tho', 'van phong']),
  style: z.string().trim().min(2, 'Style qua ngan').max(100),
  yearBorn: z.coerce.number().int().min(1900).max(2100),
  gender: z.enum(['male', 'female', 'nam', 'nu']),
});

function buildPrompt(input: {
  roomType: string;
  style: string;
  cung: CungMenh;
  nguHanh: string;
}): string {
  const palette = CUNG_PALETTE[input.cung] ?? 'tone trung tinh';
  return [
    `${input.roomType} thiet ke phong cach ${input.style}`,
    `bang phoi mau ${palette}`,
    `hop ngu hanh ${input.nguHanh}`,
    'render photorealistic, anh sang tu nhien, 8k, chi tiet cao, kien truc Viet Nam hien dai',
  ].join(', ');
}

/**
 * POST /api/ai/design (auth required)
 * Multipart form: image (file <= 10MB jpg/png) + roomType + style + yearBorn + gender
 * BE tu tinh cung menh + ngu hanh, build prompt, goi AI provider, luu DB.
 */
ai.post('/design', requireAuth, async (c) => {
  const session = getSession(c);
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return c.json({ error: 'bad_request', message: 'Yeu cau Content-Type: multipart/form-data' }, 400);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'bad_request', message: 'Form khong hop le' }, 400);
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return c.json({ error: 'bad_request', message: 'Thieu file image' }, 400);
  }
  if (file.size === 0) {
    return c.json({ error: 'bad_request', message: 'File rong' }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: 'bad_request', message: 'File qua 10MB' }, 400);
  }
  const mime = file.type;
  if (mime && mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/jpg') {
    return c.json({ error: 'bad_request', message: 'Chi cho phep JPG hoac PNG' }, 400);
  }

  const fields = {
    roomType: form.get('roomType')?.toString(),
    style: form.get('style')?.toString(),
    yearBorn: form.get('yearBorn')?.toString(),
    gender: form.get('gender')?.toString(),
  };
  const parsed = designFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return c.json(
      {
        error: 'bad_request',
        message: 'Du lieu khong hop le',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400
    );
  }

  const gender = parsed.data.gender === 'male' || parsed.data.gender === 'nam' ? 'nam' : 'nu';
  const { cung, nguHanh } = calcCung(parsed.data.yearBorn, gender);
  const prompt = buildPrompt({
    roomType: parsed.data.roomType,
    style: parsed.data.style,
    cung,
    nguHanh,
  });

  // Mock storage: dung data URL placeholder cho image_url. Real mode upload len Object Storage.
  const imageUrl = `placeholder://upload/${session.sub}/${Date.now()}-${file.name}`;
  const id = uid('dsg');
  const now = new Date().toISOString();

  try {
    // Insert pending row
    exec(
      `INSERT INTO designs (id, user_id, title, room_type, style, year_born, gender, cung_menh, ngu_hanh, prompt, image_url, results_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)`,
      [
        id,
        session.sub,
        `${parsed.data.roomType} ${parsed.data.style}`,
        parsed.data.roomType,
        parsed.data.style,
        parsed.data.yearBorn,
        gender,
        cung,
        nguHanh,
        prompt,
        imageUrl,
        null,
        now,
      ]
    );

    const result = await aiProvider.renderInterior({
      imageUrl,
      style: parsed.data.style,
      cungMenh: cung,
      nguHanh,
      roomType: parsed.data.roomType,
    });

    exec(`UPDATE designs SET results_json = ?, status = 'done' WHERE id = ?`, [
      JSON.stringify(result.results),
      id,
    ]);

    return c.json({
      ok: true,
      id,
      results: result.results,
      cungMenh: cung,
      nguHanh,
      prompt,
    });
  } catch (err) {
    try {
      exec(`UPDATE designs SET status = 'failed' WHERE id = ?`, [id]);
    } catch {
      /* ignore */
    }
    console.log(
      JSON.stringify({
        level: 'error',
        msg: 'ai.design_failed',
        id,
        userId: session.sub,
        error: err instanceof Error ? err.message : 'unknown',
        ts: now,
      })
    );
    return c.json({ error: 'ai_failed', message: 'AI khong tra ket qua, vui long thu lai' }, 502);
  }
});

export default ai;
