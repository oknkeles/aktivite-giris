// Uygulama içi AI asistan — doğal dil ile kayıt ekle/güncelle/sil/listele,
// boş iş günlerini toplu doldur (fill, önizleme döner), doğal dil rapor sorusu.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { lockedPeriodsAmong, periodOf } from '../services/period-lock.js';
import { parseAssistant, type AsstContext } from '../services/assistant-llm.js';
import { rateForDate } from '../services/rates.js';

const router = Router();
router.use(authRequired);

// TR resmi tatiller (fill'de iş günü tespiti için) — 2025-2027 sabit + dini
const TR_HOLIDAYS = new Set<string>([
  '2025-01-01','2025-03-30','2025-03-31','2025-04-01','2025-04-23','2025-05-01','2025-05-19','2025-06-06','2025-06-07','2025-06-08','2025-06-09','2025-07-15','2025-08-30','2025-10-29',
  '2026-01-01','2026-03-20','2026-03-21','2026-03-22','2026-04-23','2026-05-01','2026-05-19','2026-05-27','2026-05-28','2026-05-29','2026-05-30','2026-07-15','2026-08-30','2026-10-29',
  '2027-01-01','2027-04-23','2027-05-01','2027-05-19','2027-08-30','2027-10-29',
]);

function trToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtMoney(n: number, cur = 'TRY'): string {
  const sym: any = { TRY: '₺', USD: '$', EUR: '€' };
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ' + (sym[cur] || '₺');
}

async function resolveProject(customerId: number): Promise<{ projectId: number } | { error: string }> {
  const projs = await prisma.project.findMany({ where: { customerId, active: true }, select: { id: true } });
  if (projs.length === 1) return { projectId: projs[0].id };
  if (projs.length === 0) return { error: 'Bu müşterinin aktif projesi yok.' };
  return { error: 'Bu müşterinin birden fazla projesi var — şimdilik bu işlemi Timesheet ekranından yap.' };
}

const bodySchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(['user', 'bot']), body: z.string() })).max(12).optional(),
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'message gerekli' });
  const userId = req.user!.id;

  const [customers, activities, recentRaw] = await Promise.all([
    prisma.customer.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.activity.findMany({ where: { active: true }, select: { id: true, name: true, unit: true } }),
    prisma.entry.findMany({ where: { userId }, include: { customer: true, activity: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 30 }),
  ]);

  const ctx: AsstContext = {
    customers, activities, today: trToday(),
    recentEntries: recentRaw.map((e) => ({
      id: e.id, date: e.date, qty: e.qty, unit: e.activity.unit,
      customerId: e.customerId, customerName: e.customer.name,
      activityId: e.activityId, activityName: e.activity.name,
      ticketId: e.ticketId, note: e.note,
    })),
    conversation: parsed.data.history,
  };

  const r = await parseAssistant(parsed.data.message, ctx);

  if (r.status === 'chat' || r.status === 'needs_clarification') {
    return res.json({ kind: 'message', reply: r.reply });
  }

  const validCustomer = (id: number) => customers.some((c) => c.id === id);
  const validActivity = (id: number) => activities.some((a) => a.id === id);
  const cName = (id: number) => customers.find((c) => c.id === id)?.name || '?';
  const aMeta = (id: number) => activities.find((a) => a.id === id);

  try {
    // ── CREATE ──
    if (r.action === 'create') {
      const e = r.entry;
      if (!validCustomer(e.customerId) || !validActivity(e.activityId) || !(e.qty > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date))
        return res.json({ kind: 'message', reply: '❓ Kaydı oluşturamadım — müşteri/aktivite/süre net değil.' });
      const locked = await lockedPeriodsAmong([e.date]);
      if (locked.length) return res.json({ kind: 'message', reply: `🔒 ${locked.join(', ')} dönemi kilitli, kayıt eklenemez.` });
      const proj = await resolveProject(e.customerId);
      if ('error' in proj) return res.json({ kind: 'message', reply: '⚠️ ' + proj.error });
      const created = await prisma.entry.create({ data: { date: e.date, qty: e.qty, customerId: e.customerId, projectId: proj.projectId, activityId: e.activityId, ticketId: e.ticketId, note: e.note, userId } });
      await audit({ action: 'create', target: 'entry', targetId: created.id, userId, username: req.user!.username, summary: `Asistan: ${created.date} · ${cName(e.customerId)} · ${e.qty}`, req });
      const unit = aMeta(e.activityId)?.unit === 'saat' ? 's' : 'g';
      return res.json({ kind: 'action', refresh: true, reply: `✅ Eklendi: ${e.date} · ${cName(e.customerId)} · ${aMeta(e.activityId)?.name} · ${e.qty}${unit}` });
    }

    // ── UPDATE ──
    if (r.action === 'update') {
      const ex = await prisma.entry.findUnique({ where: { id: r.entryId } });
      if (!ex) return res.json({ kind: 'message', reply: '❌ Kayıt bulunamadı.' });
      if (ex.userId !== userId && req.user!.role !== 'admin') return res.json({ kind: 'message', reply: '⚠️ Bu kayıt sana ait değil.' });
      const u = r.updates as any;
      if (u.customerId !== undefined && !validCustomer(u.customerId)) return res.json({ kind: 'message', reply: '❓ Müşteri bulunamadı.' });
      if (u.activityId !== undefined && !validActivity(u.activityId)) return res.json({ kind: 'message', reply: '❓ Aktivite bulunamadı.' });
      const dates = [ex.date, ...(u.date ? [u.date] : [])];
      const locked = await lockedPeriodsAmong(dates);
      if (locked.length) return res.json({ kind: 'message', reply: `🔒 ${locked.join(', ')} dönemi kilitli, değiştirilemez.` });
      // müşteri değişiyorsa projeyi yeniden çöz
      if (u.customerId !== undefined) {
        const proj = await resolveProject(u.customerId);
        if ('error' in proj) return res.json({ kind: 'message', reply: '⚠️ ' + proj.error });
        u.projectId = proj.projectId;
      }
      await prisma.entry.update({ where: { id: r.entryId }, data: u });
      await audit({ action: 'update', target: 'entry', targetId: r.entryId, userId, username: req.user!.username, summary: `Asistan güncelleme #${r.entryId}`, req });
      return res.json({ kind: 'action', refresh: true, reply: `✏️ Güncellendi: #${r.entryId} (${Object.keys(r.updates).join(', ')})` });
    }

    // ── DELETE ──
    if (r.action === 'delete') {
      const ex = await prisma.entry.findUnique({ where: { id: r.entryId }, include: { customer: true, activity: true } });
      if (!ex) return res.json({ kind: 'message', reply: '❌ Kayıt bulunamadı.' });
      if (ex.userId !== userId && req.user!.role !== 'admin') return res.json({ kind: 'message', reply: '⚠️ Bu kayıt sana ait değil.' });
      const locked = await lockedPeriodsAmong([ex.date]);
      if (locked.length) return res.json({ kind: 'message', reply: `🔒 ${locked.join(', ')} dönemi kilitli, silinemez.` });
      await prisma.entry.delete({ where: { id: r.entryId } });
      await audit({ action: 'delete', target: 'entry', targetId: r.entryId, userId, username: req.user!.username, summary: `Asistan sildi: ${ex.date} · ${ex.customer.name} · ${ex.qty}`, req });
      return res.json({ kind: 'action', refresh: true, reply: `🗑️ Silindi: ${ex.date} · ${ex.customer.name} · ${ex.qty}${ex.activity.unit === 'saat' ? 's' : 'g'}` });
    }

    // ── LIST ──
    if (r.action === 'list') {
      const where: any = { userId };
      const f = r.filter || {};
      if (f.from || f.to) { where.date = {}; if (f.from) where.date.gte = f.from; if (f.to) where.date.lte = f.to; }
      if (f.customerId) where.customerId = f.customerId;
      const list = await prisma.entry.findMany({ where, include: { customer: true, activity: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 25 });
      if (!list.length) return res.json({ kind: 'message', reply: '📭 Bu kritere göre kayıt yok.' });
      const lines = list.map((e) => `• ${e.date} · ${e.customer.name} · ${e.qty}${e.activity.unit === 'saat' ? 's' : 'g'}${e.ticketId ? ` (${e.ticketId})` : ''}`);
      const total = list.reduce((s, e) => s + (e.activity.unit === 'saat' ? e.qty : e.qty * 8), 0);
      return res.json({ kind: 'message', reply: `📋 ${list.length} kayıt (toplam ${total}s):\n${lines.join('\n')}` });
    }

    // ── REPORT ──
    if (r.action === 'report') {
      // GÜVENLIK: tutar/ciro raporu gizli — sadece yönetici görebilir.
      if (req.user!.role !== 'admin') {
        return res.json({ kind: 'message', reply: '⚠️ Tutar ve gelir raporları yalnızca yöneticilere açıktır. Kendi kayıtlarını görmek için "kayıtlarımı listele" diyebilirsin.' });
      }
      const f = r.filter || {};
      const where: any = { userId };
      if (f.from || f.to) { where.date = {}; if (f.from) where.date.gte = f.from; if (f.to) where.date.lte = f.to; }
      if (f.customerId) where.customerId = f.customerId;
      const list = await prisma.entry.findMany({ where, include: { customer: { include: { contractor: true } }, project: { include: { rates: true } }, activity: true } });
      if (!list.length) return res.json({ kind: 'message', reply: '📭 Bu dönem/kritere göre kayıt yok.' });
      let hours = 0; const byCur: Record<string, number> = {};
      for (const e of list) {
        const h = e.activity.unit === 'saat' ? e.qty : e.qty * 8; hours += h;
        const rate = rateForDate(e.project?.rates, e.activityId, e.date);
        const disc = e.customer.contractor.discount || 0;
        const cur = e.customer.currency || 'TRY';
        byCur[cur] = (byCur[cur] || 0) + (h / 8) * rate * (1 - disc / 100);
      }
      const money = Object.entries(byCur).filter(([, v]) => v > 0.5).map(([c, v]) => fmtMoney(v, c)).join(' · ') || '—';
      const scope = f.customerId ? cName(f.customerId) : 'tüm müşteriler';
      const period = f.from && f.to ? `${f.from} → ${f.to}` : 'seçili dönem';
      return res.json({ kind: 'message', reply: `📊 ${scope} · ${period}\n⏱ ${hours.toFixed(1)} saat (${(hours / 8).toFixed(1)} gün) · ${list.length} kayıt\n💰 ${money}` });
    }

    // ── FILL (önizleme döner, yazmaz) ──
    if (r.action === 'fill') {
      const f = r.fill;
      if (!validCustomer(f.customerId) || !validActivity(f.activityId) || !(f.qty > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f.from) || !/^\d{4}-\d{2}-\d{2}$/.test(f.to))
        return res.json({ kind: 'message', reply: '❓ Doldurma için müşteri, aktivite, süre ve tarih aralığı net değil.' });
      const proj = await resolveProject(f.customerId);
      if ('error' in proj) return res.json({ kind: 'message', reply: '⚠️ ' + proj.error });

      // Aralıktaki iş günleri
      const start = new Date(f.from + 'T00:00:00'); const end = new Date(f.to + 'T00:00:00');
      if (end < start) return res.json({ kind: 'message', reply: '❓ Tarih aralığı hatalı.' });
      const allDates: string[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        if (!f.weekends && isWeekend) continue;
        if (TR_HOLIDAYS.has(ds)) continue;
        allDates.push(ds);
      }
      if (!allDates.length) return res.json({ kind: 'message', reply: '📭 Bu aralıkta uygun iş günü yok.' });

      // Sadece boş günler
      let candidates = allDates;
      if (f.onlyEmptyDays) {
        const existing = await prisma.entry.findMany({ where: { userId, date: { in: allDates } }, select: { date: true } });
        const filled = new Set(existing.map((e) => e.date));
        candidates = allDates.filter((ds) => !filled.has(ds));
      }
      // Kilitli dönemleri çıkar
      const lockedPeriods = await lockedPeriodsAmong(candidates);
      if (lockedPeriods.length) candidates = candidates.filter((ds) => !lockedPeriods.includes(periodOf(ds)));

      if (!candidates.length) return res.json({ kind: 'message', reply: 'ℹ️ Doldurulacak boş iş günü kalmadı (hepsi dolu veya kilitli).' });
      if (candidates.length > 90) return res.json({ kind: 'message', reply: 'Aralık çok geniş (90+ gün). Daha dar bir aralık ver.' });

      const unit = aMeta(f.activityId)?.unit === 'saat' ? 's' : 'g';
      const previewEntries = candidates.map((ds) => ({
        date: ds, qty: f.qty, projectId: proj.projectId, activityId: f.activityId, note: f.note || null, ticketId: null,
      }));
      return res.json({
        kind: 'fill_preview',
        reply: `📅 ${candidates.length} iş gününü **${cName(f.customerId)} · ${aMeta(f.activityId)?.name} · ${f.qty}${unit}** ile dolduracağım.\nOnaylıyor musun?`,
        entries: previewEntries,
        meta: { customerName: cName(f.customerId), activityName: aMeta(f.activityId)?.name, qty: f.qty, count: candidates.length, lockedSkipped: lockedPeriods },
      });
    }

    return res.json({ kind: 'message', reply: 'Tam anlayamadım, tekrar yazar mısın?' });
  } catch (err: any) {
    console.error('Assistant error:', err);
    return res.json({ kind: 'message', reply: '❌ Bir hata oluştu, tekrar dener misin?' });
  }
});

export default router;
