import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (_req, res) => {
  const list = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, username: true, fullname: true, role: true, createdAt: true },
  });
  res.json(list);
});

const createSchema = z.object({
  username: z.string().min(2),
  fullname: z.string().min(2),
  password: z.string().min(4),
  role: z.enum(['admin', 'user']).default('user'),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { username, fullname, password, role } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username: username.toLowerCase(), fullname, passwordHash, role },
    select: { id: true, username: true, fullname: true, role: true, createdAt: true },
  });
  res.json(user);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
