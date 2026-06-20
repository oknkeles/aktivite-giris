// Ay sonu özeti — her ayın 1'inde 09:00 (TR), telefonu kayıtlı admin'lere
// geçen ayın kapanış özetini WhatsApp'tan gönderir:
// toplam saat, kayıt sayısı, toplam tutar ve müşteri bazında dağılım.

import twilio from 'twilio';
import { prisma } from '../db.js';
import { rateForDate } from './rates.js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;
const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

const SUMMARY_PREFIX = '📊 Ay kapanışı';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function trNow(): Date {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

const CUR_LABEL: Record<string, string> = { TRY: 'TL', USD: 'USD', EUR: 'EUR' };
function fmtCur(n: number, currency = 'TRY'): string {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ' + (CUR_LABEL[currency] || 'TL');
}
// {TRY: 1200, USD: 400} → "1.200 TL · 400 USD"
function fmtByCurrency(byCur: Record<string, number>): string {
  const parts = Object.entries(byCur)
    .filter(([, v]) => Math.abs(v) > 0.5)
    .map(([c, v]) => fmtCur(v, c));
  return parts.length ? parts.join(' · ') : '0 TL';
}

async function buildSummary(): Promise<string | null> {
  const now = trNow();
  // Geçen ay: bu ayın 1'inden bir gün öncesi
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const period = prev.toISOString().slice(0, 7); // YYYY-MM
  const label = `${MONTH_NAMES[prev.getUTCMonth()]} ${prev.getUTCFullYear()}`;

  const entries = await prisma.entry.findMany({
    where: { date: { startsWith: period } },
    include: {
      customer: { include: { contractor: true } },
      project: { include: { rates: true } },
      activity: true,
    },
  });

  if (!entries.length) return `${SUMMARY_PREFIX} — ${label}\n\nGeçen ay hiç kayıt girilmemiş.`;

  let totalHours = 0;
  const totalByCurrency: Record<string, number> = {};
  const byCustomer: Record<string, { hours: number; net: number; currency: string }> = {};

  for (const e of entries) {
    const rate = rateForDate(e.project?.rates, e.activityId, e.date);
    const hours = e.activity.unit === 'saat' ? e.qty : e.qty * 8;
    const disc = e.customer.contractor.discount || 0;
    const net = (hours / 8) * rate * (1 - disc / 100);
    const cur = e.customer.currency || 'TRY';
    totalHours += hours;
    totalByCurrency[cur] = (totalByCurrency[cur] || 0) + net;
    const c = (byCustomer[e.customer.name] ??= { hours: 0, net: 0, currency: cur });
    c.hours += hours;
    c.net += net;
  }

  const customerLines = Object.entries(byCustomer)
    .sort((a, b) => b[1].hours - a[1].hours)
    .map(([name, v]) => `• ${name}: ${v.hours.toFixed(1)}s · ${fmtCur(v.net, v.currency)}`)
    .join('\n');

  return (
    `${SUMMARY_PREFIX} — ${label}\n\n` +
    `⏱ Toplam: ${totalHours.toFixed(1)} saat (${entries.length} kayıt)\n` +
    `💰 Tutar: ${fmtByCurrency(totalByCurrency)}\n\n` +
    `Müşteri dağılımı:\n${customerLines}\n\n` +
    `Detay için: activity.tdevco.com → Raporlar`
  );
}

async function runMonthlySummary(): Promise<void> {
  if (!twilioClient || !whatsAppFrom) return;

  const admins = await prisma.user.findMany({
    where: { role: 'admin', phone: { not: null } },
  });
  if (!admins.length) return;

  // Bugün zaten gönderilmiş mi? (restart sonrası çift mesaj atmasın)
  const startOfDay = new Date(trNow().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  startOfDay.setHours(startOfDay.getHours() - 3);
  const sentToday = await prisma.whatsAppMessage.findMany({
    where: {
      createdAt: { gte: startOfDay },
      role: 'bot',
      body: { startsWith: SUMMARY_PREFIX },
    },
    select: { userId: true },
  });
  const alreadySent = new Set(sentToday.map((m) => m.userId));

  const body = await buildSummary();
  if (!body) return;

  let sent = 0;
  for (const a of admins) {
    if (alreadySent.has(a.id) || !a.phone) continue;
    try {
      await twilioClient.messages.create({
        from: whatsAppFrom,
        to: `whatsapp:${a.phone}`,
        body,
      });
      await prisma.whatsAppMessage.create({
        data: { userId: a.id, role: 'bot', body },
      });
      sent++;
    } catch (err: any) {
      console.error(`Monthly summary send failed (${a.username}):`, err.message);
    }
  }
  console.log(`📊 Ay kapanışı özeti: ${sent}/${admins.length} admin'e gönderildi`);
}

/** Her ayın 1'inde 09:00-09:59 (TR) arası bir kez çalışır. */
export function startMonthlySummaryCron(): void {
  if (!twilioClient || !whatsAppFrom) {
    console.log('🔕 Monthly summary disabled — Twilio yapılandırılmamış');
    return;
  }

  let lastRunPeriod: string | null = null;
  setInterval(async () => {
    try {
      const now = trNow();
      const period = now.toISOString().slice(0, 7);
      if (now.getUTCDate() === 1 && now.getUTCHours() === 9 && lastRunPeriod !== period) {
        lastRunPeriod = period;
        await runMonthlySummary();
      }
    } catch (err: any) {
      console.error('Monthly summary cron error:', err.message);
    }
  }, 60 * 1000);

  console.log('📅 Ay kapanışı cron başlatıldı (her ayın 1\'i 09:00 TR)');
}
