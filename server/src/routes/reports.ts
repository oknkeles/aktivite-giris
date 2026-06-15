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
      currency: e.customer.currency,
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

// Dashboard — admin özet verisi (seçili ay müşteri dağılımı + 6 aylık trend + toplam tutar)
// ?period=YYYY-MM ile geçmişe/geleceğe gidilebilir; yoksa bu ay.
router.get('/dashboard', async (req, res) => {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const periodParam = String((req.query as any).period || '');
  const thisPeriod = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam)
    ? periodParam
    : now.toISOString().slice(0, 7); // YYYY-MM

  const [pYear, pMonth] = thisPeriod.split('-').map(Number);
  // Pencere: seçili ay dahil geriye 6 ay; bitişi seçili ayın sonu
  const windowStart = new Date(Date.UTC(pYear, pMonth - 1 - 5, 1)).toISOString().slice(0, 10);
  const windowEnd = new Date(Date.UTC(pYear, pMonth, 0)).toISOString().slice(0, 10);

  const entries = await prisma.entry.findMany({
    where: { date: { gte: windowStart, lte: windowEnd } },
    include: {
      customer: { include: { contractor: true, rates: true } },
      activity: true,
    },
  });

  // Ay listesi (eski → yeni, 6 ay) — kayıt olmayan aylar da 0 ile görünsün
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(pYear, pMonth - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  // Trend sadece saat (para birimleri karışık olabileceği için tutar trendi gösterilmiyor)
  const trend: Record<string, { period: string; hours: number }> = {};
  months.forEach((m) => (trend[m] = { period: m, hours: 0 }));

  // Bu ay müşteri bazında dağılım (her müşteri kendi para biriminde)
  const byCustomer: Record<number, { id: number; name: string; currency: string; hours: number; net: number }> = {};
  let monthHours = 0;
  let monthCount = 0;
  const monthByCurrency: Record<string, number> = {}; // para birimi → net toplam

  for (const e of entries) {
    const rate = e.customer.rates.find((r) => r.activityId === e.activityId)?.rate || 0;
    const hours = e.activity.unit === 'saat' ? e.qty : e.qty * 8;
    const disc = e.customer.contractor.discount || 0;
    const net = (hours / 8) * rate * (1 - disc / 100);
    const cur = e.customer.currency || 'TRY';

    const period = e.date.slice(0, 7);
    if (trend[period]) trend[period].hours += hours;

    if (period === thisPeriod) {
      monthHours += hours;
      monthCount++;
      monthByCurrency[cur] = (monthByCurrency[cur] || 0) + net;
      const c = (byCustomer[e.customerId] ??= {
        id: e.customerId,
        name: e.customer.name,
        currency: cur,
        hours: 0,
        net: 0,
      });
      c.hours += hours;
      c.net += net;
    }
  }

  res.json({
    period: thisPeriod,
    month: { hours: monthHours, count: monthCount, byCurrency: monthByCurrency },
    customers: Object.values(byCustomer).sort((a, b) => b.hours - a.hours),
    trend: months.map((m) => trend[m]),
  });
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
      currency: customer.currency || 'TRY',
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
