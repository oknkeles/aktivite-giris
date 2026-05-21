import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired, adminRequired);

// E.164 format: + ile başlar, 8-15 rakam (örn. +905551234567)
const phoneRegex = /^\+[1-9]\d{7,14}$/;

router.get('/', async (_req, res) => {
  const list = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true, username: true, fullname: true, role: true,
      phone: true, defaultActivityId: true, createdAt: true,
      defaultActivity: { select: { id: true, name: true, unit: true } },
    },
  });
  res.json(list);
});

const createSchema = z.object({
  username: z.string().min(2),
  fullname: z.string().min(2),
  password: z.string().min(4),
  role: z.enum(['admin', 'user']).default('user'),
  phone: z.string().regex(phoneRegex).optional().nullable(),
  defaultActivityId: z.number().int().optional().nullable(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri (telefon E.164 formatında olmalı, örn. +905551234567)' });
  const { username, fullname, password, role, phone } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' });
  if (phone) {
    const phoneExists = await prisma.user.findUnique({ where: { phone } });
    if (phoneExists) return res.status(409).json({ error: 'Bu telefon başka bir kullanıcıda kayıtlı.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      fullname,
      passwordHash,
      role,
      phone: phone || null,
      defaultActivityId: parsed.data.defaultActivityId || null,
    },
    select: {
      id: true, username: true, fullname: true, role: true,
      phone: true, defaultActivityId: true, createdAt: true,
    },
  });
  await audit({
    action: 'create',
    target: 'user',
    targetId: user.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Kullanıcı oluşturuldu: ${user.fullname} (@${user.username}, ${user.role})`,
    req,
  });
  res.json(user);
});

const updateSchema = z.object({
  fullname: z.string().min(2).optional(),
  role: z.enum(['admin', 'user']).optional(),
  phone: z.string().regex(phoneRegex).optional().nullable(),
  password: z.string().min(4).optional(),
  defaultActivityId: z.number().int().optional().nullable(),
});

router.put('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz veri (telefon E.164 formatında olmalı)' });
  const { fullname, role, phone, password } = parsed.data;

  if (phone) {
    const phoneExists = await prisma.user.findFirst({
      where: { phone, NOT: { id } },
    });
    if (phoneExists) return res.status(409).json({ error: 'Bu telefon başka bir kullanıcıda kayıtlı.' });
  }

  const data: any = {};
  if (fullname !== undefined) data.fullname = fullname;
  if (role !== undefined) data.role = role;
  if (phone !== undefined) data.phone = phone;
  if (parsed.data.defaultActivityId !== undefined)
    data.defaultActivityId = parsed.data.defaultActivityId;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, username: true, fullname: true, role: true,
      phone: true, defaultActivityId: true, createdAt: true,
    },
  });
  const changed = Object.keys(data).join(', ');
  await audit({
    action: 'update',
    target: 'user',
    targetId: updated.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Kullanıcı güncellendi: ${updated.fullname} (${changed})`,
    req,
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  const target = await prisma.user.findUnique({ where: { id }, select: { username: true, fullname: true } });
  await prisma.user.delete({ where: { id } });
  await audit({
    action: 'delete',
    target: 'user',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Kullanıcı silindi: ${target?.fullname || ''} (@${target?.username || id})`,
    req,
  });
  res.json({ ok: true });
});

export default router;
