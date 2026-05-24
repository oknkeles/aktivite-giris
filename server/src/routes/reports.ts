import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, adminRequired, type AuthRequest } from '../middleware/auth.js';
import { buildPdfReport, type ReportEntry } from '../services/pdf-report.js';

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
      ticketId: e.ticketId,
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

// PDF Rapor — bir müşteri + aylık özet
router.get('/pdf', async (req: AuthRequest, res) => {
  const { customerId, from, to, period } = req.query as Record<string, string | undefined>;

  if (!customerId) return res.status(400).json({ error: 'customerId zorunlu' });
  if (!from || !to) return res.status(400).json({ error: 'from ve to zorunlu (YYYY-MM-DD)' });

  const customer = await prisma.customer.findUnique({
    where: { id: Number(customerId) },
    include: { contractor: true, rates: true },
  });
  if (!customer) return res.status(404).json({ error: 'Müşteri bulunamadı' });

  const entries = await prisma.entry.findMany({
    where: {
      customerId: Number(customerId),
      date: { gte: from, lte: to },
    },
    include: {
      activity: true,
      user: { select: { fullname: true } },
    },
    orderBy: { date: 'asc' },
  });

  const reportEntries: ReportEntry[] = entries.map((e) => {
    const rate = customer.rates.find((r) => r.activityId === e.activityId)?.rate || 0;
    const hours = e.activity.unit === 'saat' ? e.qty : e.qty * 8;
    const days = hours / 8;
    const gross = days * rate;
    const disc = customer.contractor.discount || 0;
    const net = gross * (1 - disc / 100);
    return {
      date: e.date,
      customerName: customer.name,
      contractorName: customer.contractor.name,
      activityName: e.activity.name,
      ticketId: e.ticketId,
      note: e.note,
      hours,
      days,
      dayRate: rate,
      gross,
      net,
      userName: e.user.fullname,
    };
  });

  const totalHours = reportEntries.reduce((s, e) => s + e.hours, 0);
  const totalGross = reportEntries.reduce((s, e) => s + e.gross, 0);
  const totalNet = reportEntries.reduce((s, e) => s + e.net, 0);

  try {
    const buffer = await buildPdfReport({
      title: `${customer.name} · ${period || 'Rapor'}`,
      customerName: customer.name,
      contractorName: customer.contractor.name,
      periodLabel: period || `${from} → ${to}`,
      entries: reportEntries,
      totalHours,
      totalGross,
      totalNet,
      discount: customer.contractor.discount || 0,
      generatedAt: new Date(),
      generatedBy: req.user?.username,
    });

    // HTTP header'da Türkçe karakter olamaz → ASCII'ye düşür (fallback)
    // ve UTF-8 versiyonunu filename* ile ekle (modern tarayıcılar bunu kullanır)
    const trMap: Record<string, string> = {
      ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
      ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
    };
    const toAscii = (s: string) =>
      s
        .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => trMap[ch] || ch)
        .replace(/[^a-zA-Z0-9._-]/g, '_');

    const fullName = `rapor_${customer.name}_${period || from}.pdf`;
    const asciiName = toAscii(fullName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fullName)}`
    );
    res.send(buffer);
  } catch (err: any) {
    console.error('PDF üretim hatası:', err);
    res.status(500).json({ error: 'PDF üretilemedi: ' + (err.message || 'bilinmeyen hata') });
  }
});

export default router;
