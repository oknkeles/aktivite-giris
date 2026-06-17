import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(authRequired);

const customerInclude = {
  contractor: true,
  projects: { include: { rates: true }, orderBy: { name: 'asc' as const } },
};

router.get('/', async (_req, res) => {
  const list = await prisma.customer.findMany({
    orderBy: { name: 'asc' },
    include: customerInclude,
  });
  res.json(list);
});

// Proje şeması — id varsa güncelle, yoksa oluştur. rates: activityId → rate
const projectSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1),
  active: z.boolean().optional(),
  rates: z.record(z.string(), z.number()).optional(),
});

const schema = z.object({
  name: z.string().min(1),
  contractorId: z.number().int(),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  currency: z.enum(['TRY', 'USD', 'EUR']).optional(),
  active: z.boolean().optional(),
  projects: z.array(projectSchema).optional(),
});

// Bir müşterinin projelerini payload'a göre senkronla (ekle/güncelle/çıkar).
async function syncProjects(customerId: number, projects: z.infer<typeof projectSchema>[]) {
  const existing = await prisma.project.findMany({ where: { customerId }, select: { id: true } });
  const keepIds = new Set<number>();

  for (const p of projects) {
    let projectId = p.id;
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { name: p.name, ...(p.active !== undefined ? { active: p.active } : {}) },
      });
    } else {
      const created = await prisma.project.create({ data: { customerId, name: p.name, active: p.active ?? true } });
      projectId = created.id;
    }
    keepIds.add(projectId);

    if (p.rates) {
      await Promise.all(
        Object.entries(p.rates).map(([actId, rate]) =>
          prisma.projectRate.upsert({
            where: { projectId_activityId: { projectId: projectId!, activityId: Number(actId) } },
            update: { rate },
            create: { projectId: projectId!, activityId: Number(actId), rate },
          })
        )
      );
    }
  }

  // Payload'da olmayan projeler: kaydı yoksa sil, varsa pasife çek (veri kaybı olmasın)
  for (const ex of existing) {
    if (keepIds.has(ex.id)) continue;
    const cnt = await prisma.entry.count({ where: { projectId: ex.id } });
    if (cnt > 0) {
      await prisma.project.update({ where: { id: ex.id }, data: { active: false } });
    } else {
      await prisma.project.delete({ where: { id: ex.id } });
    }
  }
}

router.post('/', adminRequired, async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { projects, ...data } = parsed.data;
  const customer = await prisma.customer.create({ data });

  // Proje verilmemişse müşteri adıyla varsayılan bir proje aç
  const projectList = projects && projects.length ? projects : [{ name: customer.name }];
  await syncProjects(customer.id, projectList);

  await audit({
    action: 'create',
    target: 'customer',
    targetId: customer.id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Müşteri eklendi: ${customer.name} (${projectList.length} proje)`,
    req,
  });
  const full = await prisma.customer.findUnique({ where: { id: customer.id }, include: customerInclude });
  res.json(full);
});

router.patch('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid' });
  const { projects, ...data } = parsed.data;
  if (Object.keys(data).length) {
    await prisma.customer.update({ where: { id }, data: data as any });
  }
  if (projects) await syncProjects(id, projects);

  const updated = await prisma.customer.findUnique({ where: { id }, include: customerInclude });
  const changedFields = [...Object.keys(data), ...(projects ? ['proje/fiyat'] : [])];
  await audit({
    action: 'update',
    target: projects ? 'rate' : 'customer',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Müşteri güncellendi: ${updated?.name ?? id} (${changedFields.join(', ')})`,
    req,
  });
  res.json(updated);
});

router.delete('/:id', adminRequired, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.customer.findUnique({ where: { id } });
  const entryCount = await prisma.entry.count({ where: { customerId: id } });
  if (entryCount > 0) {
    return res.status(409).json({
      error: `Bu müşterinin ${entryCount} kaydı var, silinemez. Bunun yerine "Pasife Çek" ile gizleyebilirsiniz.`,
    });
  }
  await prisma.customer.delete({ where: { id } });
  await audit({
    action: 'delete',
    target: 'customer',
    targetId: id,
    userId: req.user!.id,
    username: req.user!.username,
    summary: `Müşteri silindi: ${existing?.name ?? id}`,
    req,
  });
  res.json({ ok: true });
});

export default router;
