import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (_req, res) => {
  const list = await prisma.contractor.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { customers: true } } },
  });
  res.json(list);
});

const schema = z.object({
  name: z.string().min(1),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  discount: z.number().min(0).max(100).default(0),
});

router.post('/', adminRequired, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const created = await prisma.contractor.create({ data: parsed.data });
  res.json(created);
});

router.patch('/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const updated = await prisma.contractor.update({ where: { id }, data: parsed.data });
  res.json(updated);
});

router.delete('/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  const count = await prisma.customer.count({ where: { contractorId: id } });
  if (count > 0) return res.status(400).json({ error: 'Bu yükleniciye bağlı müşteriler var.' });
  await prisma.contractor.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
