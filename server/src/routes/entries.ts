import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { parseBulkText } from '../services/llm-bulk.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req: AuthRequest, res) => {
  const { from, to, customerId, contractorId, userId } = req.query as Record<
    string,
    string | undefined
  >;

  const isAdmin = req.user!.role === 'admin';
  const where: any = {};

  // Kullanıcı filtresi:
  // - Admin: ?userId=all → hepsi, ?userId=N → o kullanıcı, parametre yok → kendi
  // - Normal: her zaman sadece kendi (parametre ne olursa olsun)
  if (isAdmin) {
    if (userId === 'all') {
      // Filtre yok — tüm kullanıcıların kayıtları
    } else if (userId && /^\d+$/.test(userId)) {
      where.userId = Number(userId);
    } else {
      where.userId = req.user!.id;
    }
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
  const list = await prisma.entry.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      customer: { include: { contractor: true } },
      activity: true,
      user: { select: { id: true, username: true, fullname: true } },
    },
  });
  res.json(list);
});

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qty: z.number().positive(),
  customerId: z.number().int(),
  activityId: z.number().int(),
  ticketId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const entry = await prisma.entry.create({
    data: { ...parsed.data, userId: req.user!.id },
    include: {
      customer: { include: { contractor: true } },
      activity: true,
      user: { select: { id: true, username: true, fullname: true } },
    },
  });
  res.json(entry);
});

const bulkSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  qty: z.number().positive(),
  customerId: z.number().int(),
  activityId: z.number().int(),
  ticketId: z.string().max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

// ── AI ile toplu giriş ──
// 1. parse: serbest metni Gemini ile satır satır parse et → preview döndür
// 2. create: parse edilmiş entry listesi → DB'ye yaz

const bulkParseSchema = z.object({
  text: z.string().min(3).max(20000),
});

router.post('/bulk-parse', async (req: AuthRequest, res) => {
  const parsed = bulkParseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'text alanı zorunlu' });

  const [customers, activities, user] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true } }),
    prisma.activity.findMany({ select: { id: true, name: true, unit: true } }),
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { defaultActivityId: true },
    }),
  ]);

  // Bugün TR
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const today = tr.toISOString().slice(0, 10);

  const result = await parseBulkText(parsed.data.text, {
    customers,
    activities,
    today,
    defaultActivityId: user?.defaultActivityId || null,
  });

  if (!result.ok) return res.status(500).json({ error: result.error || 'Parse hatası' });
  res.json({ entries: result.entries });
});

const bulkCreateSchema = z.object({
  entries: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        qty: z.number().positive(),
        customerId: z.number().int(),
        activityId: z.number().int(),
        ticketId: z.string().max(80).optional().nullable(),
        note: z.string().max(2000).optional().nullable(),
      })
    )
    .min(1)
    .max(200),
});

router.post('/bulk-create', async (req: AuthRequest, res) => {
  const parsed = bulkCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri' });

  const userId = req.user!.id;
  const created = await prisma.$transaction(
    parsed.data.entries.map((e) =>
      prisma.entry.create({
        data: {
          date: e.date,
          qty: e.qty,
          customerId: e.customerId,
          activityId: e.activityId,
          ticketId: e.ticketId || null,
          note: e.note || null,
          userId,
        },
      })
    )
  );
  res.json({ created: created.length });
});

router.post('/bulk', async (req: AuthRequest, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { dates, ...rest } = parsed.data;
  const created = await prisma.$transaction(
    dates.map((date) =>
      prisma.entry.create({ data: { ...rest, date, userId: req.user!.id } })
    )
  );
  res.json({ created: created.length });
});

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  qty: z.number().positive().optional(),
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
  // Sadece sahibi veya admin güncelleyebilir
  if (req.user!.role !== 'admin' && entry.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  const updated = await prisma.entry.update({
    where: { id },
    data: parsed.data,
    include: {
      customer: { include: { contractor: true } },
      activity: true,
      user: { select: { id: true, username: true, fullname: true } },
    },
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.entry.findUnique({
    where: { id },
    include: { customer: true, activity: true },
  });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (req.user!.role !== 'admin' && entry.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  await prisma.entry.delete({ where: { id } });
  await audit({
    action: 'delete',
    target: 'entry',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Kayıt silindi: ${entry.date} · ${entry.customer.name} · ${entry.qty}${entry.activity.unit === 'saat' ? 's' : 'g'}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
