import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, readAllRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired);

// E.164 format: + ile başlar, 8-15 rakam (örn. +905551234567)
const phoneRegex = /^\+[1-9]\d{7,14}$/;

router.get('/', readAllRequired, async (_req, res) => {
  const list = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true, username: true, fullname: true, role: true,
      phone: true, defaultActivityId: true, contractorId: true, createdAt: true,
      defaultActivity: { select: { id: true, name: true, unit: true } },
      contractor: { select: { id: true, name: true } },
    },
  });
  res.json(list);
});

const createSchema = z.object({
  username: z.string().min(2),
  fullname: z.string().min(2),
  password: z.string().min(4),
  role: z.enum(['admin', 'py', 'user']).default('user'),
  phone: z.string().regex(phoneRegex).optional().nullable(),
  defaultActivityId: z.number().int().optional().nullable(),
  contractorId: z.number().int().optional().nullable(),
});

router.post('/', adminRequired, async (req: AuthRequest, res) => {
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
      contractorId: parsed.data.contractorId || null,
    },
    select: {
      id: true, username: true, fullname: true, role: true,
      phone: true, defaultActivityId: true, contractorId: true, createdAt: true,
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
  role: z.enum(['admin', 'py', 'user']).optional(),
  phone: z.string().regex(phoneRegex).optional().nullable(),
  password: z.string().min(4).optional(),
  defaultActivityId: z.number().int().optional().nullable(),
  contractorId: z.number().int().optional().nullable(),
});

router.put('/:id', adminRequired, async (req: AuthRequest, res) => {
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
  if (parsed.data.contractorId !== undefined) data.contractorId = parsed.data.contractorId;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, username: true, fullname: true, role: true,
      phone: true, defaultActivityId: true, contractorId: true, createdAt: true,
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

router.delete('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  const target = await prisma.user.findUnique({ where: { id }, select: { username: true, fullname: true } });
  // Kaydı olan kullanıcı silinemez — geçmiş aktivite verisi (cascade ile) kaybolmasın.
  const entryCount = await prisma.entry.count({ where: { userId: id } });
  if (entryCount > 0) {
    return res.status(409).json({
      error: `Bu kullanıcının ${entryCount} aktivite kaydı var, silinemez. Kayıtlar korunmalı.`,
    });
  }
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
