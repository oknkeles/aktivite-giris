import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired);

router.get('/', async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === 'admin';
  const list = await prisma.contractor.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { customers: true } } },
  });
  // GÜVENLIK: iskonto (discount) gizli fiyat bilgisi — USER görmemeli.
  res.json(isAdmin ? list : list.map(({ discount, ...c }) => c));
});

const schema = z.object({
  name: z.string().min(1),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  discount: z.number().min(0).max(100).default(0),
});

router.post('/', adminRequired, async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const created = await prisma.contractor.create({ data: parsed.data });
  await audit({
    action: 'create',
    target: 'contractor',
    targetId: created.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Yüklenici eklendi: ${created.name} (%${created.discount} iskonto)`,
    req,
  });
  res.json(created);
});

router.patch('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const updated = await prisma.contractor.update({ where: { id }, data: parsed.data });
  await audit({
    action: 'update',
    target: 'contractor',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Yüklenici güncellendi: ${updated.name} (${Object.keys(parsed.data).join(', ')})`,
    req,
  });
  res.json(updated);
});

router.delete('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const count = await prisma.customer.count({ where: { contractorId: id } });
  if (count > 0) return res.status(400).json({ error: 'Bu yükleniciye bağlı müşteriler var.' });
  const existing = await prisma.contractor.findUnique({ where: { id } });
  await prisma.contractor.delete({ where: { id } });
  await audit({
    action: 'delete',
    target: 'contractor',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Yüklenici silindi: ${existing?.name ?? id}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
