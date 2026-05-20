import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (req, res) => {
  const { from, to, customerId, contractorId } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }
  if (customerId) where.customerId = Number(customerId);
  if (contractorId) where.customer = { contractorId: Number(contractorId) };

  const entries = await prisma.entry.findMany({
    where,
    include: {
      customer: { include: { contractor: true, rates: true } },
      activity: true,
    },
    orderBy: { date: 'asc' },
  });

  // Calculate amounts
  const data = entries.map((e) => {
    const rateRow = e.customer.rates.find((r) => r.activityId === e.activityId);
    const dayRate = rateRow?.rate || 0;
    const hours = e.activity.unit === 'saat' ? e.qty : e.qty * 8;
    const days = hours / 8;
    const gross = days * dayRate;
    const disc = e.customer.contractor.discount || 0;
    const net = gross * (1 - disc / 100);
    return {
      id: e.id,
      date: e.date,
      qty: e.qty,
      unit: e.activity.unit,
      hours,
      days,
      note: e.note,
      customerId: e.customer.id,
      customerName: e.customer.name,
      contractorId: e.customer.contractor.id,
      contractorName: e.customer.contractor.name,
      discount: disc,
      activityId: e.activity.id,
      activityName: e.activity.name,
      dayRate,
      gross,
      net,
    };
  });

  const totalGross = data.reduce((s, e) => s + e.gross, 0);
  const totalNet = data.reduce((s, e) => s + e.net, 0);
  const totalHours = data.reduce((s, e) => s + e.hours, 0);

  res.json({ entries: data, totalGross, totalNet, totalHours, count: data.length });
});

export default router;
