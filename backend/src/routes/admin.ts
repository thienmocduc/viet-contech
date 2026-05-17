import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, getSession } from '../lib/auth.js';
import { exec, queryOne, query } from '../lib/db.js';
import { uid } from '../lib/uid.js';
import { audit } from '../lib/audit.js';
import type { Context, Next } from 'hono';

const admin = new Hono();

// =====================================================
// Middleware: require admin role
// =====================================================
async function requireAdmin(c: Context, next: Next): Promise<Response | void> {
  const session = c.get('session') as { sub?: string; role?: string } | undefined;
  if (!session?.sub) return c.json({ error: 'unauthorized' }, 401);
  if (session.role !== 'admin') return c.json({ error: 'forbidden', message: 'Chi admin moi truy cap' }, 403);
  await next();
}
admin.use('*', requireAuth);
admin.use('*', requireAdmin);

// =====================================================
// GET /api/admin/stats — Dashboard top stats
// =====================================================
admin.get('/stats', (c) => {
  const userTotal = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM users`, [])?.c ?? 0;
  const customerTotal = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE role='customer'`, [])?.c ?? 0;
  const agentTotal = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE role='agent'`, [])?.c ?? 0;
  const affTotal = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE role IN ('aff','sale')`, [])?.c ?? 0;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const leadsMonth = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM leads_pipeline WHERE created_at >= ?`,
    [monthStart]
  )?.c ?? 0;
  const projectsRunning = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM dna_records WHERE status='locked'`,
    []
  )?.c ?? 0;
  const revenueRow = queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status='success' AND created_at >= ?`,
    [monthStart]
  );
  const mrrRow = queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(CASE WHEN plan='premium' THEN 199000 WHEN plan='vip' THEN 499000 ELSE 0 END),0) AS s
     FROM members WHERE status='active'`,
    []
  );
  return c.json({
    ok: true,
    users: { total: userTotal, customer: customerTotal, agent: agentTotal, affiliate: affTotal },
    leads: { thisMonth: leadsMonth },
    projects: { running: projectsRunning },
    revenue: { thisMonth: revenueRow?.s ?? 0, mrr: mrrRow?.s ?? 0 },
  });
});

// =====================================================
// LEADS PIPELINE
// =====================================================
admin.get('/leads', (c) => {
  const stage = c.req.query('stage');
  const source = c.req.query('source');
  const params: (string | number)[] = [];
  let where = 'WHERE 1=1';
  if (stage) {
    where += ' AND stage=?';
    params.push(stage);
  }
  if (source) {
    where += ' AND source=?';
    params.push(source);
  }
  const rows = query<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    source: string;
    source_ref: string | null;
    stage: string;
    project_type: string | null;
    budget: number | null;
    assigned_to: string | null;
    hot_score: number;
    created_at: string;
  }>(
    `SELECT id, name, phone, email, source, source_ref, stage, project_type, budget, assigned_to, hot_score, created_at
     FROM leads_pipeline ${where} ORDER BY hot_score DESC, created_at DESC LIMIT 200`,
    params
  );
  return c.json({ ok: true, leads: rows });
});

const leadCreateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^0\d{9,10}$/).optional(),
  email: z.string().email().optional(),
  source: z.enum(['web', 'chatbot', 'affiliate', 'direct', 'zalo', 'facebook', 'google_ads']).default('direct'),
  sourceRef: z.string().max(100).optional(),
  projectType: z.string().max(40).optional(),
  budget: z.number().int().optional(),
  notes: z.string().max(1000).optional(),
});
admin.post('/leads', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = leadCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  const id = uid('lead');
  const now = new Date().toISOString();
  exec(
    `INSERT INTO leads_pipeline (id, name, phone, email, source, source_ref, stage, project_type, budget, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.data.name,
      parsed.data.phone ?? null,
      parsed.data.email ?? null,
      parsed.data.source,
      parsed.data.sourceRef ?? null,
      parsed.data.projectType ?? null,
      parsed.data.budget ?? null,
      parsed.data.notes ?? null,
      now,
      now,
    ]
  );
  audit(c, 'lead.create', { type: 'lead', id }, parsed.data);
  return c.json({ ok: true, id }, 201);
});

const leadUpdateSchema = z.object({
  stage: z.enum(['new', 'consulting', 'quoted', 'signed', 'cancelled']).optional(),
  assignedTo: z.string().optional(),
  hotScore: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
  budget: z.number().int().optional(),
});
admin.patch('/leads/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request', issues: parsed.error.issues }, 400);
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  if (parsed.data.stage !== undefined) {
    fields.push('stage=?');
    params.push(parsed.data.stage);
  }
  if (parsed.data.assignedTo !== undefined) {
    fields.push('assigned_to=?');
    params.push(parsed.data.assignedTo);
  }
  if (parsed.data.hotScore !== undefined) {
    fields.push('hot_score=?');
    params.push(parsed.data.hotScore);
  }
  if (parsed.data.notes !== undefined) {
    fields.push('notes=?');
    params.push(parsed.data.notes);
  }
  if (parsed.data.budget !== undefined) {
    fields.push('budget=?');
    params.push(parsed.data.budget);
  }
  if (fields.length === 0) return c.json({ error: 'bad_request', message: 'Khong co thay doi' }, 400);
  fields.push('updated_at=?');
  params.push(new Date().toISOString());
  params.push(id);
  exec(`UPDATE leads_pipeline SET ${fields.join(', ')} WHERE id=?`, params);
  audit(c, 'lead.update', { type: 'lead', id }, parsed.data);
  return c.json({ ok: true });
});

// =====================================================
// USERS management
// =====================================================
admin.get('/users', (c) => {
  const role = c.req.query('role');
  const search = c.req.query('q');
  const params: string[] = [];
  let where = 'WHERE 1=1';
  if (role) {
    where += ' AND role=?';
    params.push(role);
  }
  if (search) {
    where += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ?)';
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q);
  }
  const rows = query<{
    id: string;
    email: string;
    name: string;
    phone: string | null;
    role: string;
    provider: string;
    created_at: string;
  }>(
    `SELECT id, email, name, phone, role, provider, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return c.json({ ok: true, users: rows });
});

const userRoleSchema = z.object({ role: z.enum(['customer', 'agent', 'sale', 'aff', 'supplier', 'admin']) });
admin.patch('/users/:id/role', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = userRoleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'bad_request' }, 400);
  exec(`UPDATE users SET role=?, updated_at=? WHERE id=?`, [
    parsed.data.role,
    new Date().toISOString(),
    id,
  ]);
  audit(c, 'user.role_change', { type: 'user', id }, parsed.data);
  return c.json({ ok: true });
});

// =====================================================
// PAYOUTS approval
// =====================================================
admin.get('/payouts', (c) => {
  const status = c.req.query('status');
  const params: string[] = [];
  let where = 'WHERE 1=1';
  if (status) {
    where += ' AND ap.status=?';
    params.push(status);
  }
  const rows = query<{
    id: string;
    user_id: string;
    user_name: string;
    amount: number;
    method: string;
    account_info: string | null;
    status: string;
    created_at: string;
  }>(
    `SELECT ap.id, ap.user_id, u.name AS user_name, ap.amount, ap.method, ap.account_info, ap.status, ap.created_at
     FROM affiliate_payouts ap LEFT JOIN users u ON u.id=ap.user_id
     ${where} ORDER BY ap.created_at DESC LIMIT 100`,
    params
  );
  return c.json({ ok: true, payouts: rows });
});

admin.post('/payouts/:id/approve', (c) => {
  const id = c.req.param('id');
  exec(`UPDATE affiliate_payouts SET status='approved' WHERE id=? AND status='pending'`, [id]);
  audit(c, 'payout.approve', { type: 'payout', id });
  return c.json({ ok: true });
});

admin.post('/payouts/:id/paid', (c) => {
  const id = c.req.param('id');
  exec(`UPDATE affiliate_payouts SET status='paid', paid_at=? WHERE id=? AND status IN ('approved','pending')`, [
    new Date().toISOString(),
    id,
  ]);
  audit(c, 'payout.paid', { type: 'payout', id });
  return c.json({ ok: true });
});

admin.post('/payouts/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  exec(`UPDATE affiliate_payouts SET status='rejected', note=? WHERE id=? AND status='pending'`, [
    (body as { reason?: string }).reason ?? null,
    id,
  ]);
  audit(c, 'payout.reject', { type: 'payout', id }, body as Record<string, unknown>);
  return c.json({ ok: true });
});

// =====================================================
// AUDIT logs viewer
// =====================================================
admin.get('/audit', (c) => {
  const action = c.req.query('action');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
  const params: (string | number)[] = [];
  let where = 'WHERE 1=1';
  if (action) {
    where += ' AND action=?';
    params.push(action);
  }
  params.push(limit);
  const rows = query<{
    id: string;
    actor_email: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    ip: string | null;
    created_at: string;
  }>(
    `SELECT id, actor_email, action, target_type, target_id, ip, created_at
     FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ?`,
    params
  );
  return c.json({ ok: true, logs: rows });
});

export default admin;
