import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// JWT secret zorunlu — env yoksa server başlatma (fail-fast).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error(
    'FATAL: JWT_SECRET env değişkeni tanımlı değil veya çok kısa (>=16 karakter olmalı).'
  );
}

// Brute-force koruması: 15 dakikada en fazla 8 deneme/IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla deneme. Lütfen 15 dakika sonra tekrar dene.' },
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit({
      action: 'login_fail',
      target: 'session',
      username: username.toLowerCase(),
      summary: `Başarısız giriş denemesi: ${username}`,
      req,
    });
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  await audit({
    action: 'login',
    target: 'session',
    userId: user.id,
    username: user.username,
    summary: `${user.fullname} giriş yaptı`,
    req,
  });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      role: user.role,
      defaultActivityId: user.defaultActivityId,
    },
  });
});

// NOT: Self-register endpoint kaldırıldı — kullanıcılar sadece admin tarafından
// /api/users üzerinden oluşturulabilir. Bu, kontrolsüz hesap açılmasını engeller.

router.get('/me', authRequired, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: user.id,
    username: user.username,
    fullname: user.fullname,
    role: user.role,
    defaultActivityId: user.defaultActivityId,
  });
});

export default router;
