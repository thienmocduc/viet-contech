import { Hono } from 'hono';
import { z } from 'zod';
import { l2, l4 } from '../lib/zeni.js';
import type { Contact } from '../types.js';

const contact = new Hono();

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^(\+84|0)[0-9]{9,10}$/, 'So dien thoai khong hop le'),
  email: z.string().email().optional(),
  area: z.coerce.number().positive().max(10000).optional(),
  need: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  source: z.string().max(100).optional(),
});

/**
 * POST /api/contact
 * 1. Validate form
 * 2. INSERT viet_contech.contacts (Lop 02)
 * 3. Emit event 'contact.created' -> Lop 04 fan-out toi Zalo OA + email sales
 */
contact.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  }

  const row: Contact = {
    ...parsed.data,
    createdAt: new Date().toISOString(),
  };

  try {
    const inserted = await l2.insert<Contact>('contacts', row);

    // Fire-and-forget event — neu loi cung khong block response
    l4.emitEvent('contact.created', {
      id: inserted.id,
      name: row.name,
      phone: row.phone,
      // KHONG log full email/note vao log neu chua mask, nhung gui qua event bus thi OK
      email: row.email,
      area: row.area,
      need: row.need,
      source: row.source,
    }).catch((err) => {
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'l4.emit_failed',
        event: 'contact.created',
        error: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      }));
    });

    // Log structured — chi log id va metadata, KHONG log PII
    console.log(JSON.stringify({
      level: 'info',
      msg: 'contact.created',
      id: inserted.id,
      hasEmail: !!row.email,
      need: row.need,
      ts: new Date().toISOString(),
    }));

    return c.json({ ok: true, id: inserted.id }, 201);
  } catch (err) {
    console.log(JSON.stringify({
      level: 'error',
      msg: 'contact.insert_failed',
      error: err instanceof Error ? err.message : 'unknown',
      ts: new Date().toISOString(),
    }));
    return c.json({ error: 'upstream_error', message: 'Khong luu duoc lien he' }, 502);
  }
});

export default contact;
