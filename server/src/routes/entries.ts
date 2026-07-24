import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, canReadAll, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { parseBulkText } from '../services/llm-bulk.js';
import { lockedPeriodsAmong, lockedError } from '../services/period-lock.js';
import { scopeContractorIds, applyScopeToEntryWhere } from '../services/scope.js';

const router = Router();
router.use(authRequired);

const entryInclude = {
  // GÜVENLIK: contractor.discount gizli — entry yanıtında sadece ad/id taşınır.
  customer: { include: { contractor: { select: { id: true, name: true } } } },
  project: { select: { id: true, name: true } },
  activity: true,
  user: { select: { id: true, username: true, fullname: true } },
};

// projectId verilirse müşteriyi ondan türet; sadece customerId verilmişse
// (WhatsApp/AI/legacy) müşterinin TEK aktif projesi varsa otomatik bağla.
type Resolved = { projectId: number; customerId: number };
async function resolveTarget(opts: { projectId?: number | null; customerId?: number | null }): Promise<Resolved | { error: string }> {
  if (opts.projectId) {
    const proj = await prisma.project.findUnique({ where: { id: opts.projectId }, select: { id: true, customerId: true } });
    if (!proj) return { error: 'Geçersiz proje' };
    return { projectId: proj.id, customerId: proj.customerId };
  }
  if (opts.customerId) {
    const projs = await prisma.project.findMany({ where: { customerId: opts.customerId, active: true }, select: { id: true } });
    if (projs.length === 1) return { projectId: projs[0].id, customerId: opts.customerId };
    if (projs.length === 0) return { error: 'Bu müşterinin aktif projesi yok — önce proje ekleyin' };
    return { error: 'Bu müşterinin birden fazla projesi var — proje seçin' };
  }
  return { error: 'Proje seçilmedi' };
}

router.get('/', async (req: AuthRequest, res) => {
  const { from, to, customerId, contractorId, userId } = req.query as Record<string, string | undefined>;
  const isAdmin = canReadAll(req.user!.role); // admin + py tum kayitlari gorur
  const where: any = {};

  if (isAdmin) {
    if (userId === 'all') { /* hepsi */ }
    else if (userId && /^\d+$/.test(userId)) where.userId = Number(userId);
    else where.userId = req.user!.id;
  } else {
    where.userId = req.user!.id;
  }

  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }
  if (customerId) where.customerId = Number(customerId);
  if (contractorId) where.customer = { contractorId: Number(contractorId) };

  // KAPSAM: admin/PY sadece sorumlu olduğu yüklenicilerin müşterilerini görür.
  // Normal kullanıcı zaten yalnızca kendi kayıtlarını görüyor (kapsam gereksiz).
  if (isAdmin) {
    const scopeIds = await scopeContractorIds(req.user!.id);
    applyScopeToEntryWhere(where, scopeIds);
  }

  const list = await prisma.entry.findMany({ where, orderBy: { date: 'desc' }, include: entryInclude });
  res.json(list);
});

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qty: z.number().positive(),
  projectId: z.number().int().optional(),
  customerId: z.number().int().optional(),
  activityId: z.number().int(),
  ticketId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const locked = await lockedPeriodsAmong([parsed.data.date]);
  if (locked.length) return res.status(423).json({ error: lockedError(locked) });

  const t = await resolveTarget(parsed.data);
  if ('error' in t) return res.status(400).json({ error: t.error });

  const e = parsed.data;
  const entry = await prisma.entry.create({
    data: {
      date: e.date, qty: e.qty, activityId: e.activityId,
      ticketId: e.ticketId || null, note: e.note || null,
      customerId: t.customerId, projectId: t.projectId, userId: req.user!.id,
    },
    include: entryInclude,
  });
  await audit({
    action: 'create', target: 'entry', targetId: entry.id,
    userId: req.user!.id, username: req.user!.username,
    summary: `Kayıt eklendi: ${entry.date} · ${entry.customer.name} · ${entry.qty}${entry.activity.unit === 'saat' ? 's' : 'g'}`,
    req,
  });
  res.json(entry);
});

const bulkParseSchema = z.object({ text: z.string().min(3).max(20000) });

router.post('/bulk-parse', async (req: AuthRequest, res) => {
  const parsed = bulkParseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'text alanı zorunlu' });

  const [customers, activities, user] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true } }),
    prisma.activity.findMany({ select: { id: true, name: true, unit: true } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { defaultActivityId: true } }),
  ]);

  const now = new Date();
  const today = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const result = await parseBulkText(parsed.data.text, {
    customers, activities, today, defaultActivityId: user?.defaultActivityId || null,
  });
  if (!result.ok) return res.status(500).json({ error: result.error || 'Parse hatası' });
  res.json({ entries: result.entries });
});

const bulkEntryItem = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qty: z.number().positive(),
  projectId: z.number().int().optional(),
  customerId: z.number().int().optional(),
  activityId: z.number().int(),
  ticketId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

const bulkCreateSchema = z.object({ entries: z.array(bulkEntryItem).min(1).max(200) });

router.post('/bulk-create', async (req: AuthRequest, res) => {
  const parsed = bulkCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri' });

  const lockedBulk = await lockedPeriodsAmong(parsed.data.entries.map((e) => e.date));
  if (lockedBulk.length) return res.status(423).json({ error: lockedError(lockedBulk) });

  // Her satır için projeyi çöz
  const resolved: { row: z.infer<typeof bulkEntryItem>; t: Resolved }[] = [];
  for (const row of parsed.data.entries) {
    const t = await resolveTarget(row);
    if ('error' in t) return res.status(400).json({ error: `${row.date}: ${t.error}` });
    resolved.push({ row, t });
  }

  const userId = req.user!.id;
  const created = await prisma.$transaction(
    resolved.map(({ row, t }) =>
      prisma.entry.create({
        data: {
          date: row.date, qty: row.qty, activityId: row.activityId,
          ticketId: row.ticketId || null, note: row.note || null,
          customerId: t.customerId, projectId: t.projectId, userId,
        },
      })
    )
  );
  res.json({ created: created.length });
});

const importSchema = z.object({
  entries: z.array(z.object({
    userId: z.number().int(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    qty: z.number().positive(),
    projectId: z.number().int().optional(),
    customerId: z.number().int().optional(),
    activityId: z.number().int(),
    ticketId: z.string().max(80).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  })).min(1).max(1000),
});

router.post('/import', async (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Sadece yönetici içe aktarabilir' });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri' });
  const rows = parsed.data.entries;

  const locked = await lockedPeriodsAmong(rows.map((r) => r.date));
  if (locked.length) return res.status(423).json({ error: lockedError(locked) });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const activityIds = [...new Set(rows.map((r) => r.activityId))];
  const [validUsers, validActivities] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
    prisma.activity.findMany({ where: { id: { in: activityIds } }, select: { id: true } }),
  ]);
  if (validUsers.length !== userIds.length || validActivities.length !== activityIds.length) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı/aktivite referansı var' });
  }

  // Her satır için projeyi çöz
  const data: any[] = [];
  for (const r of rows) {
    const t = await resolveTarget(r);
    if ('error' in t) return res.status(400).json({ error: `${r.date}: ${t.error}` });
    data.push({
      date: r.date, qty: r.qty, activityId: r.activityId,
      ticketId: r.ticketId || null, note: r.note || null,
      customerId: t.customerId, projectId: t.projectId, userId: r.userId,
    });
  }

  const created = await prisma.entry.createMany({ data });
  await audit({
    action: 'create', target: 'entry',
    userId: req.user!.id, username: req.user!.username,
    summary: `Excel içe aktarma: ${created.count} kayıt (${userIds.length} kullanıcı)`,
    req,
  });
  res.json({ created: created.count });
});

const bulkSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  qty: z.number().positive(),
  projectId: z.number().int().optional(),
  customerId: z.number().int().optional(),
  activityId: z.number().int(),
  ticketId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

router.post('/bulk', async (req: AuthRequest, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { dates, qty, activityId, ticketId, note } = parsed.data;
  const locked = await lockedPeriodsAmong(dates);
  if (locked.length) return res.status(423).json({ error: lockedError(locked) });

  const t = await resolveTarget(parsed.data);
  if ('error' in t) return res.status(400).json({ error: t.error });

  const created = await prisma.$transaction(
    dates.map((date) =>
      prisma.entry.create({
        data: {
          date, qty, activityId, ticketId: ticketId || null, note: note || null,
          customerId: t.customerId, projectId: t.projectId, userId: req.user!.id,
        },
      })
    )
  );
  res.json({ created: created.length });
});

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  qty: z.number().positive().optional(),
  projectId: z.number().int().optional(),
  customerId: z.number().int().optional(),
  activityId: z.number().int().optional(),
  ticketId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

router.put('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const entry = await prisma.entry.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role !== 'admin' && entry.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  const datesToCheck = [entry.date, ...(parsed.data.date ? [parsed.data.date] : [])];
  const locked = await lockedPeriodsAmong(datesToCheck);
  if (locked.length) return res.status(423).json({ error: lockedError(locked) });

  const { projectId, customerId, ...rest } = parsed.data;
  const data: any = { ...rest };
  // Proje/müşteri değişiyorsa ikisini birlikte güncelle
  if (projectId !== undefined || customerId !== undefined) {
    const t = await resolveTarget({ projectId, customerId });
    if ('error' in t) return res.status(400).json({ error: t.error });
    data.projectId = t.projectId;
    data.customerId = t.customerId;
  }

  const updated = await prisma.entry.update({ where: { id }, data, include: entryInclude });
  await audit({
    action: 'update', target: 'entry', targetId: updated.id,
    userId: req.user!.id, username: req.user!.username,
    summary: `Kayıt güncellendi: #${updated.id} (${Object.keys(parsed.data).join(', ')})`,
    req,
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.entry.findUnique({ where: { id }, include: { customer: true, activity: true } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role !== 'admin' && entry.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  const locked = await lockedPeriodsAmong([entry.date]);
  if (locked.length) return res.status(423).json({ error: lockedError(locked) });
  await prisma.entry.delete({ where: { id } });
  await audit({
    action: 'delete', target: 'entry', targetId: id,
    userId: req.user!.id, username: req.user!.username,
    summary: `Kayıt silindi: ${entry.date} · ${entry.customer.name} · ${entry.qty}${entry.activity.unit === 'saat' ? 's' : 'g'}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
