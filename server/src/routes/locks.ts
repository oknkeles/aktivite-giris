// Dönem kilidi yönetimi — sadece admin.
// Kilitli dönem listesi, kilitle, kilidi aç. Her işlem audit'e düşer.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (_req, res) => {
  const list = await prisma.periodLock.findMany({ orderBy: { period: 'desc' } });
  res.json(list);
});

const lockSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // YYYY-MM
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = lockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz dönem (YYYY-MM bekleniyor)' });
  const { period } = parsed.data;

  const existing = await prisma.periodLock.findUnique({ where: { period } });
  if (existing) return res.status(400).json({ error: 'Bu dönem zaten kilitli.' });

  const lock = await prisma.periodLock.create({
    data: { period, lockedBy: req.user!.username },
  });
  await audit({
    action: 'create',
    target: 'period',
    targetId: lock.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Dönem kilitlendi: ${period}`,
    req,
  });
  res.json(lock);
});

router.delete('/:period', async (req: AuthRequest, res) => {
  const period = String(req.params.period);
  const existing = await prisma.periodLock.findUnique({ where: { period } });
  if (!existing) return res.status(404).json({ error: 'Bu dönem kilitli değil.' });

  await prisma.periodLock.delete({ where: { period } });
  await audit({
    action: 'delete',
    target: 'period',
    targetId: existing.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Dönem kilidi açıldı: ${period}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
