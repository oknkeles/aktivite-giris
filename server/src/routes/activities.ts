import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/', async (_req, res) => {
  const list = await prisma.activity.findMany({ orderBy: { id: 'asc' } });
  res.json(list);
});

const createSchema = z.object({
  name: z.string().min(1),
  unit: z.string().default('saat'),
  desc: z.string().optional(),
});

router.post('/', adminRequired, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const activity = await prisma.activity.create({ data: parsed.data });
  res.json(activity);
});

router.delete('/:id', adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  await prisma.activity.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
