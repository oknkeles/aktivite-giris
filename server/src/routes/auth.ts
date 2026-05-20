import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'dev',
    { expiresIn: '30d' }
  );
  res.json({
    token,
    user: { id: user.id, username: user.username, fullname: user.fullname, role: user.role },
  });
});

const registerSchema = z.object({
  username: z.string().min(2).max(40),
  fullname: z.string().min(2).max(80),
  password: z.string().min(4).max(100),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { username, fullname, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username: username.toLowerCase(), fullname, passwordHash, role: 'user' },
  });
  res.json({ ok: true, user: { id: user.id, username: user.username, fullname, role: user.role } });
});

router.get('/me', authRequired, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, username: user.username, fullname: user.fullname, role: user.role });
});

export default router;
