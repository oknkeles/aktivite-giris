// Audit log read endpoint — sadece admin.

import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (req, res) => {
  const { from, to, action, target, userId, limit } = req.query as Record<
    string,
    string | undefined
  >;
  const where: any = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to + 'T23:59:59');
  }
  if (action) where.action = action;
  if (target) where.target = target;
  if (userId) where.userId = Number(userId);

  const take = Math.min(Number(limit) || 200, 1000);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json(logs);
});

export default router;
