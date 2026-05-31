import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired);

router.get('/', async (_req, res) => {
  const list = await prisma.customer.findMany({
    orderBy: { name: 'asc' },
    include: { contractor: true, rates: true },
  });
  res.json(list);
});

const schema = z.object({
  name: z.string().min(1),
  contractorId: z.number().int(),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  rates: z.record(z.string(), z.number()).optional(), // activityId → rate
});

router.post('/', adminRequired, async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { rates, ...data } = parsed.data;
  const customer = await prisma.customer.create({ data });
  if (rates) {
    await Promise.all(
      Object.entries(rates).map(([actId, rate]) =>
        prisma.customerRate.create({
          data: { customerId: customer.id, activityId: Number(actId), rate },
        })
      )
    );
  }
  await audit({
    action: 'create',
    target: 'customer',
    targetId: customer.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Müşteri eklendi: ${customer.name}${rates ? ` (+${Object.keys(rates).length} fiyat)` : ''}`,
    req,
  });
  const full = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { contractor: true, rates: true },
  });
  res.json(full);
});

router.patch('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { rates, ...data } = parsed.data;
  if (Object.keys(data).length) {
    await prisma.customer.update({ where: { id }, data: data as any });
  }
  if (rates) {
    await Promise.all(
      Object.entries(rates).map(([actId, rate]) =>
        prisma.customerRate.upsert({
          where: { customerId_activityId: { customerId: id, activityId: Number(actId) } },
          update: { rate },
          create: { customerId: id, activityId: Number(actId), rate },
        })
      )
    );
  }
  const updated = await prisma.customer.findUnique({
    where: { id },
    include: { contractor: true, rates: true },
  });
  // Fiyat değişiklikleri faturayı doğrudan etkiler — ayrı audit hedefi 'rate'.
  const changedFields = [
    ...Object.keys(data),
    ...(rates ? ['fiyat'] : []),
  ];
  await audit({
    action: 'update',
    target: rates ? 'rate' : 'customer',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Müşteri güncellendi: ${updated?.name ?? id} (${changedFields.join(', ')})`,
    req,
  });
  res.json(updated);
});

router.delete('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.customer.findUnique({ where: { id } });
  await prisma.customer.delete({ where: { id } });
  await audit({
    action: 'delete',
    target: 'customer',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Müşteri silindi: ${existing?.name ?? id}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
