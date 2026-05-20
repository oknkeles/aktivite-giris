import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

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

router.post('/', adminRequired, async (req, res) => {
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
  const full = await prisma.customer.findUnique({
    where: { id: customer.id },
    include: { contractor: true, rates: true },
  });
  res.json(full);
});

router.patch('/:id', adminRequired, async (req, res) => {
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
  res.json(updated);
});

router.delete('/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  await prisma.customer.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
