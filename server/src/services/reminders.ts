// Smart Reminders — günlük WhatsApp hatırlatıcı.
// Pazartesi-Cuma 18:00 (TR) — WhatsApp numarası kayıtlı + bugüne kaydı OLMAYAN
// kullanıcılara nazikçe hatırlatma yollar.
//
// Tatil günleri (Türkiye resmi tatiller) atlanır.

import twilio from 'twilio';
import { prisma } from '../db.js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;
const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

// TR resmi tatil takvimi (sabit + dini). Dini bayramlar yıllık güncellenir.
// Genel referans; küçük şirkete yeter.
const TR_HOLIDAYS_2026: string[] = [
  '2026-01-01', // Yılbaşı
  '2026-03-20', // Ramazan Bayramı 1.
  '2026-03-21', // Ramazan Bayramı 2.
  '2026-03-22', // Ramazan Bayramı 3.
  '2026-04-23', // Ulusal Egemenlik
  '2026-05-01', // İşçi Bayramı
  '2026-05-19', // Atatürk'ü Anma
  '2026-05-26', // Arefe (yarım gün ama biz tatil sayalım)
  '2026-05-27', // Kurban Bayramı 1.
  '2026-05-28', // Kurban Bayramı 2.
  '2026-05-29', // Kurban Bayramı 3.
  '2026-05-30', // Kurban Bayramı 4.
  '2026-07-15', // Demokrasi ve Milli Birlik
  '2026-08-30', // Zafer Bayramı
  '2026-10-29', // Cumhuriyet Bayramı
];

function trToday(): string {
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}

function trHour(): number {
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.getUTCHours();
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow === 0 || dow === 6; // Pazar veya Cumartesi
}

function isHoliday(dateStr: string): boolean {
  return TR_HOLIDAYS_2026.includes(dateStr);
}

async function sendReminder(phone: string, fullname: string) {
  if (!twilioClient || !whatsAppFrom) return false;
  try {
    const firstName = fullname.split(' ')[0];
    await twilioClient.messages.create({
      from: whatsAppFrom,
      to: `whatsapp:${phone}`,
      body:
        `👋 Merhaba ${firstName}!\n\n` +
        `Bugüne henüz aktivite girmemişsin. Boşa geçmiş gün yoksa hızlıca kaydedelim 🙂\n\n` +
        `Örnek:\n` +
        `• "bugün 8 saat Aktek FIORI dashboard"\n` +
        `• "yarım gün Beymen JIRA-123"`,
    });
    return true;
  } catch (err: any) {
    console.error(`Reminder send failed for ${phone}:`, err.message);
    return false;
  }
}

// Bugün için hatırlatma gönder. Tek hatırlatma — bugün için zaten gönderilmişse atla.
async function runReminders(): Promise<void> {
  const today = trToday();

  if (isWeekend(today)) {
    console.log(`🔕 Reminders skipped — weekend (${today})`);
    return;
  }
  if (isHoliday(today)) {
    console.log(`🔕 Reminders skipped — holiday (${today})`);
    return;
  }

  // Telefonu kayıtlı kullanıcılar
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, fullname: true, phone: true },
  });

  if (users.length === 0) return;

  // Bugüne en az 1 kaydı OLMAYAN kullanıcıları bul
  const todaysEntries = await prisma.entry.findMany({
    where: { date: today, userId: { in: users.map((u) => u.id) } },
    select: { userId: true },
  });
  const haveEntry = new Set(todaysEntries.map((e) => e.userId));

  const needsReminder = users.filter((u) => !haveEntry.has(u.id));

  if (needsReminder.length === 0) {
    console.log(`✅ Reminders: ${users.length} user, hepsi bugün kaydını girmiş`);
    return;
  }

  // Bugün hatırlatma gönderilmiş mi? (audit log üzerinden kontrol)
  // Basit yaklaşım: WhatsAppMessage tablosunda bugün 'bot' rolünde "👋 Merhaba" içeren bir mesaj var mı?
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  startOfDay.setHours(startOfDay.getHours() - 3); // TR offset
  const alreadyReminded = await prisma.whatsAppMessage.findMany({
    where: {
      createdAt: { gte: startOfDay },
      role: 'bot',
      body: { startsWith: '👋 Merhaba' },
      userId: { in: needsReminder.map((u) => u.id) },
    },
    select: { userId: true },
  });
  const remindedSet = new Set(alreadyReminded.map((m) => m.userId));

  let sent = 0;
  for (const u of needsReminder) {
    if (remindedSet.has(u.id)) continue;
    if (!u.phone) continue;
    const ok = await sendReminder(u.phone, u.fullname);
    if (ok) {
      sent++;
      // Hatırlatma da konuşma geçmişine kaydedilsin
      await prisma.whatsAppMessage.create({
        data: {
          userId: u.id,
          role: 'bot',
          body: `👋 Merhaba ${u.fullname.split(' ')[0]}! Bugüne kaydını hatırlatıyorum.`,
        },
      });
    }
  }
  console.log(`📬 Reminders: ${sent} hatırlatma gönderildi (${needsReminder.length} aday)`);
}

/**
 * Reminder cron'unu başlatır. Her dakikada bir kontrol eder; saat 18:00 (TR) olduğunda
 * günde bir kez tetikler. Cron tipi ayrı paket gerektirmediği için setInterval yeterli.
 */
export function startReminderCron(): void {
  if (!twilioClient || !whatsAppFrom) {
    console.log('🔕 Reminders disabled — Twilio yapılandırılmamış');
    return;
  }

  let lastRunDate: string | null = null;
  setInterval(async () => {
    try {
      const hour = trHour();
      const today = trToday();
      // 18:00 - 18:59 TR arası bir kez çalıştır
      if (hour === 18 && lastRunDate !== today) {
        lastRunDate = today;
        await runReminders();
      }
    } catch (err: any) {
      console.error('Reminder cron error:', err.message);
    }
  }, 60 * 1000); // her dakika kontrol

  console.log('⏰ Reminder cron başlatıldı (her gün 18:00 TR)');
}
