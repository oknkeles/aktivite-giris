// WhatsApp webhook — Twilio Sandbox / Business API üzerinden gelen mesajları işler.
// Akış:
//   1. Twilio POST gelir (x-www-form-urlencoded): { From, Body, ... }
//   2. From = "whatsapp:+905551234567" → numarayı normalize et, user bul
//   3. User'ın customer/activity listesini Gemini'a context olarak gönder
//   4. LLM parse'lar → Entry oluştur veya clarification iste
//   5. Twilio API ile WhatsApp'a cevap yolla

import { Router } from 'express';
import twilio from 'twilio';
import { prisma } from '../db.js';
import { parseWhatsAppMessage } from '../services/llm.js';

const router = Router();

// Twilio form-urlencoded gönderdiği için body-parser eklemek lazım
import express from 'express';
router.use(express.urlencoded({ extended: false }));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsAppFrom = process.env.TWILIO_WHATSAPP_FROM; // örn. "whatsapp:+14155238886"

const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

async function sendWhatsApp(to: string, body: string) {
  if (!twilioClient || !whatsAppFrom) {
    console.warn('Twilio yapılandırılmamış, mesaj gönderilemedi:', body);
    return;
  }
  try {
    await twilioClient.messages.create({
      from: whatsAppFrom,
      to,
      body,
    });
  } catch (err: any) {
    console.error('Twilio send error:', err.message);
  }
}

function todayStr(): string {
  // Türkiye saati (UTC+3) baz alarak bugünün tarihini al
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}

function normalizePhone(twilioFrom: string): string {
  // "whatsapp:+905551234567" → "+905551234567"
  return twilioFrom.replace(/^whatsapp:/, '').trim();
}

router.post('/webhook', async (req, res) => {
  const from = String(req.body.From || '');
  const body = String(req.body.Body || '').trim();

  // Twilio webhook ACK — hızlı 200 dön, async işle
  res.type('text/xml').send('<Response></Response>');

  if (!from || !body) return;

  const phone = normalizePhone(from);

  try {
    // 1. Telefondan user'ı bul
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      await sendWhatsApp(
        from,
        '⚠️ Bu numara sisteme kayıtlı değil. Yöneticinizden numaranızı kaydetmesini isteyin.'
      );
      return;
    }

    // 2. Hızlı komutlar — yardım, son kayıtlar
    const lower = body.toLowerCase();
    if (['yardım', 'help', '?', 'menu'].includes(lower)) {
      await sendWhatsApp(
        from,
        `🤖 *Aktivite Bot*\n\n` +
          `Örnek mesajlar:\n` +
          `• "bugün 8 saat Aktek FIORI tasarımı"\n` +
          `• "dün yarım gün Beymen JIRA-123"\n` +
          `• "geçen cuma 4 saat Akkök SAP support"\n\n` +
          `Komutlar:\n` +
          `• *bugün* — bugünkü kayıtların\n` +
          `• *son* — son 5 kaydın\n` +
          `• *yardım* — bu menü`
      );
      return;
    }

    if (lower === 'bugün') {
      const today = todayStr();
      const entries = await prisma.entry.findMany({
        where: { userId: user.id, date: today },
        include: { customer: true, activity: true },
      });
      if (!entries.length) {
        await sendWhatsApp(from, '📭 Bugüne kayıt yok.');
        return;
      }
      const lines = entries.map(
        (e) => `• ${e.customer.name} · ${e.activity.name} · ${e.qty}${e.activity.unit === 'saat' ? 's' : 'g'}`
      );
      const total = entries.reduce(
        (s, e) => s + (e.activity.unit === 'saat' ? e.qty : e.qty * 8),
        0
      );
      await sendWhatsApp(from, `📅 Bugün:\n${lines.join('\n')}\n\nToplam: ${total}s`);
      return;
    }

    if (lower === 'son') {
      const recent = await prisma.entry.findMany({
        where: { userId: user.id },
        include: { customer: true, activity: true },
        orderBy: { date: 'desc' },
        take: 5,
      });
      if (!recent.length) {
        await sendWhatsApp(from, '📭 Hiç kayıt yok.');
        return;
      }
      const lines = recent.map(
        (e) =>
          `• ${e.date} · ${e.customer.name} · ${e.qty}${e.activity.unit === 'saat' ? 's' : 'g'}`
      );
      await sendWhatsApp(from, `🕒 Son kayıtlar:\n${lines.join('\n')}`);
      return;
    }

    // 3. Doğal dil parse — LLM
    const [customers, activities] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.activity.findMany({ select: { id: true, name: true, unit: true } }),
    ]);

    const parsed = await parseWhatsAppMessage(body, {
      customers,
      activities,
      today: todayStr(),
    });

    if (!parsed.ok || !parsed.entry) {
      await sendWhatsApp(from, `❓ ${parsed.clarification || 'Mesajı anlayamadım.'}`);
      return;
    }

    // 4. Entry oluştur
    const e = parsed.entry;
    const created = await prisma.entry.create({
      data: {
        date: e.date,
        qty: e.qty,
        customerId: e.customerId,
        activityId: e.activityId,
        ticketId: e.ticketId,
        note: e.note,
        userId: user.id,
      },
      include: { customer: true, activity: true },
    });

    const dateLabel = (() => {
      const d = new Date(created.date + 'T00:00:00');
      return `${d.getDate()}.${d.getMonth() + 1}`;
    })();

    await sendWhatsApp(
      from,
      `✅ Kaydedildi:\n` +
        `${dateLabel} · ${created.customer.name} · ${created.activity.name}\n` +
        `${created.qty}${created.activity.unit === 'saat' ? ' saat' : ' gün'}` +
        (created.ticketId ? `\n🎫 ${created.ticketId}` : '') +
        (created.note ? `\n📝 ${created.note}` : '')
    );
  } catch (err: any) {
    console.error('WhatsApp webhook error:', err);
    try {
      await sendWhatsApp(from, '❌ Bir hata oluştu, tekrar denermisin?');
    } catch {}
  }
});

export default router;
