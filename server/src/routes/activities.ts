import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

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

router.post('/', adminRequired, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const activity = await prisma.activity.create({ data: parsed.data });
  await audit({
    action: 'create',
    target: 'activity',
    targetId: activity.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Aktivite türü eklendi: ${activity.name} (${activity.unit})`,
    req,
  });
  res.json(activity);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().optional(),
  desc: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

router.patch('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const activity = await prisma.activity.update({ where: { id }, data: parsed.data as any });
  await audit({
    action: 'update',
    target: 'activity',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Aktivite türü güncellendi: ${activity.name} (${Object.keys(parsed.data).join(', ')})`,
    req,
  });
  res.json(activity);
});

router.delete('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.activity.findUnique({ where: { id } });
  // Kaydı olan aktivite türü silinemez — geçmiş veri kaybolmasın. Pasife çekilebilir.
  const entryCount = await prisma.entry.count({ where: { activityId: id } });
  if (entryCount > 0) {
    return res.status(409).json({
      error: `Bu aktivite türünün ${entryCount} kaydı var, silinemez. Bunun yerine "Pasife Çek" ile gizleyebilirsiniz.`,
    });
  }
  await prisma.activity.delete({ where: { id } });
  await audit({
    action: 'delete',
    target: 'activity',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Aktivite türü silindi: ${existing?.name ?? id}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
