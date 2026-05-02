import { Hono } from 'hono';
import { z } from 'zod';
import { l3 } from '../lib/zeni.js';
import { maybeAuth } from '../lib/auth.js';
import type { AiDesignResponse } from '../types.js';

const ai = new Hono();

const designFieldsSchema = z.object({
  roomType: z.enum(['phong khach', 'phong ngu', 'bep', 'phong tho', 'van phong']),
  style: z.string().trim().min(2).max(100),
  cung: z.string().trim().max(20).optional(),
  nh: z.enum(['Dong tu menh', 'Tay tu menh']).optional(),
});

/**
 * Tao prompt cho sd-lora-interior dua tren cung menh phong thuy.
 * TODO: phoi hop voi designer/phong thuy gia de tinh chinh palette + furniture mapping.
 */
function buildPrompt(input: z.infer<typeof designFieldsSchema>): string {
  const colorByCung: Record<string, string> = {
    Khan: 'tone vang dat, nau go, am cung',
    Khon: 'tone vang nhat, be, dat nung',
    Chan: 'tone xanh la, nau go sang',
    Ton: 'tone xanh la dam, xanh duong nhat',
    Khanh: 'tone trang sua, vang kim',
    Ly: 'tone do, cam, hong dat',
    Doai: 'tone trang, bac, vang anh kim',
    Can: 'tone xanh duong, den, ghi',
    Cang: 'tone trang nga, vang nhat',
  };
  const palette = input.cung ? colorByCung[input.cung] : 'tone trung tinh, hai hoa';
  const flow = input.nh === 'Dong tu menh' ? 'bo cuc huong Dong/Nam' : 'bo cuc huong Tay/Bac';
  return [
    `${input.roomType} thiet ke phong cach ${input.style}`,
    `bang phoi mau ${palette}`,
    flow,
    'render photorealistic, anh sang tu nhien, 8k, chi tiet cao, kien truc Viet Nam hien dai',
  ].join(', ');
}

/**
 * POST /api/ai/design
 * Multipart upload anh phong (field 'image') + JSON fields (roomType, style, cung, nh).
 * 1. Validate
 * 2. Upload anh len Object Storage Lop 03
 * 3. POST AI Engine sd-lora-interior voi prompt theo phong thuy
 * 4. Tra 4 image URLs
 */
ai.post('/design', maybeAuth, async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return c.json({ error: 'bad_request', message: 'Yeu cau multipart/form-data' }, 400);
  }

  const form = await c.req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) {
    return c.json({ error: 'bad_request', message: 'Thieu file image' }, 400);
  }
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: 'bad_request', message: 'File qua 10MB' }, 400);
  }

  const fields = {
    roomType: form.get('roomType')?.toString(),
    style: form.get('style')?.toString(),
    cung: form.get('cung')?.toString() || undefined,
    nh: form.get('nh')?.toString() || undefined,
  };
  const parsed = designFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }

  try {
    // 1) Upload len Object Storage
    const ts = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const key = `designs/${ts}-${safeName}`;
    const buffer = await file.arrayBuffer();
    const uploadedUrl = await l3.uploadObject(key, file.type || 'image/jpeg', buffer);

    // 2) Sinh prompt + goi AI engine
    const prompt = buildPrompt(parsed.data);
    const aiRes = await l3.generateInterior({
      sourceImageUrl: uploadedUrl,
      prompt,
      numOutputs: 4,
    });

    const result: AiDesignResponse = {
      jobId: aiRes.jobId,
      uploadedUrl,
      results: aiRes.results,
      prompt,
      createdAt: new Date().toISOString(),
    };

    console.log(JSON.stringify({
      level: 'info',
      msg: 'ai.design_done',
      jobId: result.jobId,
      roomType: parsed.data.roomType,
      style: parsed.data.style,
      cung: parsed.data.cung,
      ts: result.createdAt,
    }));

    return c.json(result);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'ai.design_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'ai_failed', message: 'AI Engine khong tra ket qua' }, 502);
  }
});

export default ai;
