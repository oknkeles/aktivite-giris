import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req: AuthRequest, res) => {
  const { from, to, customerId, contractorId } = req.query as Record<string, string | undefined>;
  // Her kullanıcı sadece kendi kayıtlarını görür (admin dahil).
  // Tüm kayıtları görmek için /api/reports admin endpoint'i kullanılır.
  const where: any = { userId: req.user!.id };
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

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const entry = await prisma.entry.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  // Users can only delete their own; admins can delete any
  if (req.user!.role !== 'admin' && entry.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  await prisma.entry.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
