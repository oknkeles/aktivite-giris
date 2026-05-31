// WhatsApp webhook — Twilio'dan gelen mesajları işler.
// Tam CRUD: create / update / delete / list

import { Router } from 'express';
import express from 'express';
import twilio from 'twilio';
import { prisma } from '../db.js';
import { audit } from '../services/audit.js';
import {
  parseWhatsAppMessage,
  type RecentEntry,
  type ConversationTurn,
} from '../services/llm.js';

const router = Router();
router.use(express.urlencoded({ extended: false }));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;

const twilioClient =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

async function sendWhatsApp(to: string, body: string, userId?: number) {
  if (!twilioClient || !whatsAppFrom) {
    console.warn('Twilio yapılandırılmamış, mesaj gönderilemedi:', body);
    return;
  }
  try {
    await twilioClient.messages.create({ from: whatsAppFrom, to, body });
    // Bot cevabını da konuşma geçmişine kaydet (multi-turn için)
    if (userId) {
      await prisma.whatsAppMessage.create({
        data: { userId, role: 'bot', body },
      });
    }
  } catch (err: any) {
    console.error('Twilio send error:', err.message);
  }
}

function todayStr(): string {
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}

function normalizePhone(twilioFrom: string): string {
  return twilioFrom.replace(/^whatsapp:/, '').trim();
}

function fmtEntry(e: {
  id: number;
  date: string;
  qty: number;
  customer: { name: string };
  activity: { name: string; unit: string };
  ticketId?: string | null;
}): string {
  const d = new Date(e.date + 'T00:00:00');
  const dateLabel = `${d.getDate()}.${d.getMonth() + 1}`;
  const unit = e.activity.unit === 'saat' ? 's' : 'g';
  return (
    `#${e.id} · ${dateLabel} · ${e.customer.name} · ${e.activity.name} · ${e.qty}${unit}` +
    (e.ticketId ? ` (${e.ticketId})` : '')
  );
}

router.post('/webhook', async (req, res) => {
  const from = String(req.body.From || '');
  const body = String(req.body.Body || '').trim();

  // Twilio ACK
  res.type('text/xml').send('<Response></Response>');

  if (!from || !body) return;
  const phone = normalizePhone(from);

  try {
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      await sendWhatsApp(
        from,
        '⚠️ Bu numara sisteme kayıtlı değil. Yöneticinizden numaranızı kaydetmesini isteyin.'
      );
      return;
    }

    // Inbound mesajı geçmişe ekle (multi-turn için)
    await prisma.whatsAppMessage.create({
      data: { userId: user.id, role: 'user', body },
    });

    // Hızlı komutlar
    const lower = body.toLowerCase();

    if (['yardım', 'help', '?', 'menu', 'menü'].includes(lower)) {
      await sendWhatsApp(
        from,
        `🤖 *Aktivite Bot*\n\n` +
          `*Ekle:*\n` +
          `• "bugün 8 saat Aktek FIORI dashboard"\n` +
          `• "dün yarım gün Beymen JIRA-123"\n\n` +
          `*Güncelle:*\n` +
          `• "dünkü Aktek'i 4 saate çevir"\n` +
          `• "son kaydımın notu: x modülü"\n\n` +
          `*Sil:*\n` +
          `• "son kaydımı sil"\n` +
          `• "dünkü Beymen'i sil"\n\n` +
          `*Listele:*\n` +
          `• "bugün" — bugünkü kayıtlar\n` +
          `• "son" — son 5 kaydım\n` +
          `• "bu hafta" / "geçen ay"\n\n` +
          `Yardım için *yardım* yaz.`,
        user.id
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
        await sendWhatsApp(from, '📭 Bugüne kayıt yok.', user.id);
        return;
      }
      const lines = entries.map(fmtEntry);
      const total = entries.reduce(
        (s, e) => s + (e.activity.unit === 'saat' ? e.qty : e.qty * 8),
        0
      );
      await sendWhatsApp(
        from,
        `📅 Bugün:\n${lines.join('\n')}\n\nToplam: ${total}s`,
        user.id
      );
      return;
    }

    if (lower === 'son') {
      const recent = await prisma.entry.findMany({
        where: { userId: user.id },
        include: { customer: true, activity: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 5,
      });
      if (!recent.length) {
        await sendWhatsApp(from, '📭 Hiç kayıt yok.', user.id);
        return;
      }
      const lines = recent.map(fmtEntry);
      await sendWhatsApp(from, `🕒 Son kayıtlar:\n${lines.join('\n')}`, user.id);
      return;
    }

    // Doğal dil parse için context hazırla — recent entries + konuşma geçmişi
    const [customers, activities, recentRaw, historyRaw] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.activity.findMany({
        select: { id: true, name: true, unit: true },
      }),
      prisma.entry.findMany({
        where: { userId: user.id },
        include: { customer: true, activity: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 30,
      }),
      // Son 15 dakikadaki konuşma — multi-turn diyalog için, ŞU ANKİ inbound HARİÇ
      prisma.whatsAppMessage.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
    ]);

    // Şimdi gelen mesajı history'den çıkar (zaten az önce kaydettik; LLM'e ayrı geçeceğiz)
    const conversation: ConversationTurn[] = historyRaw
      .slice(0, -1) // son eleman = az önce kaydettiğimiz inbound, onu prompt'a ayrı geçiyoruz
      .map((m) => ({
        role: m.role as 'user' | 'bot',
        body: m.body,
      }));

    const recentEntries: RecentEntry[] = recentRaw.map((e) => ({
      id: e.id,
      date: e.date,
      qty: e.qty,
      unit: e.activity.unit,
      customerId: e.customerId,
      customerName: e.customer.name,
      activityId: e.activityId,
      activityName: e.activity.name,
      ticketId: e.ticketId,
      note: e.note,
    }));

    const parsed = await parseWhatsAppMessage(body, {
      customers,
      activities,
      recentEntries,
      today: todayStr(),
      conversation,
    });

    if (!parsed.ok || !parsed.result) {
      await sendWhatsApp(
        from,
        `❓ ${parsed.clarification || 'Mesajı anlayamadım.'}`,
        user.id
      );
      return;
    }

    const r = parsed.result;

    // ── CREATE ──
    if (r.action === 'create') {
      const e = r.entry;
      // LLM çıktısı güven temelli değil — müşteri/aktivite/süre/tarih'i doğrula.
      // Geçersizse DB'ye yazma; FK hatası ya da hayali veri oluşmasın.
      const validCustomer = customers.some((c) => c.id === e.customerId);
      const validActivity = activities.some((a) => a.id === e.activityId);
      if (
        !validCustomer ||
        !validActivity ||
        !(e.qty > 0) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(e.date)
      ) {
        await sendWhatsApp(
          from,
          '❓ Kaydı oluşturamadım — müşteri, aktivite ve süre net değil. Tekrar yazar mısın?',
          user.id
        );
        return;
      }
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
      await audit({
        action: 'create',
        target: 'entry',
        targetId: created.id,
        userId: user.id,
        username: user.username,
        summary: `WhatsApp ile kayıt: ${created.date} · ${created.customer.name} · ${created.qty}${created.activity.unit === 'saat' ? 's' : 'g'}`,
        req,
      });
      await sendWhatsApp(
        from,
        `✅ Eklendi:\n${fmtEntry(created)}` +
          (created.note ? `\n📝 ${created.note}` : ''),
        user.id
      );
      return;
    }

    // ── UPDATE ──
    if (r.action === 'update') {
      const existing = await prisma.entry.findUnique({
        where: { id: r.entryId },
      });
      if (!existing) {
        await sendWhatsApp(from, '❌ Kayıt bulunamadı.', user.id);
        return;
      }
      if (existing.userId !== user.id) {
        await sendWhatsApp(from, '⚠️ Bu kayıt sana ait değil.', user.id);
        return;
      }

      // LLM çıktısı doğrulama — değiştirilen müşteri/aktivite/süre/tarih geçerli mi?
      const u = r.updates as Record<string, any>;
      if (u.customerId !== undefined && !customers.some((c) => c.id === u.customerId)) {
        await sendWhatsApp(from, '❓ Belirttiğin müşteriyi bulamadım.', user.id);
        return;
      }
      if (u.activityId !== undefined && !activities.some((a) => a.id === u.activityId)) {
        await sendWhatsApp(from, '❓ Belirttiğin aktiviteyi bulamadım.', user.id);
        return;
      }
      if (u.qty !== undefined && !(u.qty > 0)) {
        await sendWhatsApp(from, '❓ Süre geçerli değil.', user.id);
        return;
      }
      if (u.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(u.date)) {
        await sendWhatsApp(from, '❓ Tarih geçerli değil.', user.id);
        return;
      }

      const updated = await prisma.entry.update({
        where: { id: r.entryId },
        data: r.updates as any,
        include: { customer: true, activity: true },
      });
      await audit({
        action: 'update',
        target: 'entry',
        targetId: updated.id,
        userId: user.id,
        username: user.username,
        summary: `WhatsApp ile güncelleme: #${updated.id} (${Object.keys(u).join(', ')})`,
        req,
      });

      const changes = Object.keys(r.updates)
        .map((k) => {
          const label: any = {
            qty: 'süre',
            date: 'tarih',
            customerId: 'müşteri',
            activityId: 'aktivite',
            ticketId: 'talep',
            note: 'not',
          };
          return label[k] || k;
        })
        .join(', ');

      await sendWhatsApp(
        from,
        `✏️ Güncellendi (${changes}):\n${fmtEntry(updated)}` +
          (updated.note ? `\n📝 ${updated.note}` : ''),
        user.id
      );
      return;
    }

    // ── DELETE ──
    if (r.action === 'delete') {
      const existing = await prisma.entry.findUnique({
        where: { id: r.entryId },
        include: { customer: true, activity: true },
      });
      if (!existing) {
        await sendWhatsApp(from, '❌ Kayıt bulunamadı.', user.id);
        return;
      }
      if (existing.userId !== user.id) {
        await sendWhatsApp(from, '⚠️ Bu kayıt sana ait değil.', user.id);
        return;
      }

      await prisma.entry.delete({ where: { id: r.entryId } });
      await audit({
        action: 'delete',
        target: 'entry',
        targetId: existing.id,
        userId: user.id,
        username: user.username,
        summary: `WhatsApp ile silindi: ${existing.date} · ${existing.customer.name} · ${existing.qty}${existing.activity.unit === 'saat' ? 's' : 'g'}`,
        req,
      });
      await sendWhatsApp(
        from,
        `🗑️ Silindi:\n${fmtEntry(existing)}`,
        user.id
      );
      return;
    }

    // ── LIST ──
    if (r.action === 'list') {
      const where: any = { userId: user.id };
      if (r.filter?.from || r.filter?.to) {
        where.date = {};
        if (r.filter.from) where.date.gte = r.filter.from;
        if (r.filter.to) where.date.lte = r.filter.to;
      }
      if (r.filter?.customerId) where.customerId = r.filter.customerId;

      const list = await prisma.entry.findMany({
        where,
        include: { customer: true, activity: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 20,
      });

      if (!list.length) {
        await sendWhatsApp(from, '📭 Bu kritere göre kayıt yok.', user.id);
        return;
      }

      const lines = list.map(fmtEntry);
      const total = list.reduce(
        (s, e) => s + (e.activity.unit === 'saat' ? e.qty : e.qty * 8),
        0
      );
      await sendWhatsApp(
        from,
        `📊 ${list.length} kayıt:\n${lines.join('\n')}\n\nToplam: ${total}s`,
        user.id
      );
      return;
    }
  } catch (err: any) {
    console.error('WhatsApp webhook error:', err);
    try {
      await sendWhatsApp(from, '❌ Bir hata oluştu, tekrar dener misin?');
    } catch {}
  }
});

export default router;
