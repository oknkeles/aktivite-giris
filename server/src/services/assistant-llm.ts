// Uygulama içi AI asistan — doğal dil mesajını aksiyona çevirir.
// Aksiyonlar: create | update | delete | list | fill | report | chat
// WhatsApp parser'ından farkı: "fill" (boş iş günlerini doldur) ve
// "report" (doğal dil rapor sorusu) aksiyonları + sohbet (chat) yanıtı.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface AsstRecentEntry {
  id: number; date: string; qty: number; unit: string;
  customerId: number; customerName: string;
  activityId: number; activityName: string;
  ticketId: string | null; note: string | null;
}
export interface AsstContext {
  customers: { id: number; name: string }[];
  activities: { id: number; name: string; unit: string }[];
  recentEntries: AsstRecentEntry[];
  today: string;
  conversation?: { role: 'user' | 'bot'; body: string }[];
}

export type AsstParsed =
  | { status: 'needs_clarification'; reply: string }
  | { status: 'chat'; reply: string }
  | { status: 'ok'; action: 'create'; entry: any }
  | { status: 'ok'; action: 'update'; entryId: number; updates: any }
  | { status: 'ok'; action: 'delete'; entryId: number }
  | { status: 'ok'; action: 'list'; filter?: any }
  | { status: 'ok'; action: 'report'; filter?: any }
  | { status: 'ok'; action: 'fill'; fill: any };

function buildPrompt(ctx: AsstContext): string {
  const customerList = ctx.customers.map((c) => `  ${c.id}: ${c.name}`).join('\n');
  const activityList = ctx.activities.map((a) => `  ${a.id}: ${a.name} (${a.unit})`).join('\n');
  const recentList = ctx.recentEntries.length
    ? ctx.recentEntries.map((e) => `  #${e.id}: ${e.date} · ${e.customerName} · ${e.activityName} · ${e.qty}${e.unit === 'saat' ? 's' : 'g'}${e.ticketId ? ` (${e.ticketId})` : ''}`).join('\n')
    : '  (henüz kayıt yok)';

  return `Sen TDev Consulting'in aktivite kayıt ASİSTANISIN. Kullanıcı Türkçe yazar, sen aksiyon çıkarırsın.

BUGÜN: ${ctx.today}

AKSİYONLAR:
- create: tek yeni kayıt ("bugün 8 saat Aktek dashboard")
- update: kaydı güncelle ("dünkü Aktek'i 4 saate çevir")
- delete: kayıt sil ("son kaydımı sil")
- list: kayıtları listele ("bu haftaki kayıtlarım")
- fill: bir tarih ARALIĞINDAKİ iş günlerini aynı kayıtla TOPLU doldur
  ("bu ayın boş günlerini Aktek 8 saat destek ile doldur", "her iş gününe THY gir",
   "1-15 mayıs arası Beymen 8 saat")
- report: doğal dil rapor sorusu ("geçen ay Beymen kaç gün", "bu ay toplam kaç saat")
- chat: selamlama, yardım, alakasız sohbet → kısa Türkçe "reply" ver

MEVCUT MÜŞTERİLER (id: ad):
${customerList || '  (yok)'}

MEVCUT AKTİVİTELER (id: ad (birim)):
${activityList || '  (yok)'}

KULLANICININ SON KAYITLARI:
${recentList}

KURALLAR:
1. Tarihleri ${ctx.today}'e göre çöz. "bu ay" = içinde bulunulan ayın 1'i → son günü. "geçen ay" = önceki ay. "bu hafta" = pazartesi-bugün.
2. create/fill için müşteri ZORUNLU. Saat: "8 saat"→8, "yarım gün"→4, "tam gün"→8 (birim saat ise saat ver).
3. fill: from, to (YYYY-MM-DD), customerId, activityId, qty zorunlu. note opsiyonel.
   onlyEmptyDays=true ise sadece kaydı OLMAYAN iş günleri (varsayılan true).
   weekends=false (varsayılan) → sadece hafta içi.
4. update/delete için son kayıtlardan eşleşen entryId'yi (sayı) ver.
5. report: from,to ver; customerId opsiyonel.
6. Müşteri/aktivite/aralık belirsizse → status:needs_clarification + kısa "reply" sorusu.
7. Önceki turdaki sorunla yeni cevabı BİRLEŞTİR (multi-turn).
8. Selam/teşekkür/"ne yapabilirsin" → status:chat, reply: kısa yardımcı cevap.

ÇIKTI: yalnızca JSON.`;
}

const schema = {
  type: SchemaType.OBJECT,
  properties: {
    status: { type: SchemaType.STRING, enum: ['ok', 'needs_clarification', 'chat'] },
    action: { type: SchemaType.STRING, enum: ['create', 'update', 'delete', 'list', 'fill', 'report'], nullable: true },
    reply: { type: SchemaType.STRING, nullable: true },
    entry: {
      type: SchemaType.OBJECT, nullable: true,
      properties: {
        date: { type: SchemaType.STRING },
        qty: { type: SchemaType.NUMBER },
        customerId: { type: SchemaType.INTEGER },
        activityId: { type: SchemaType.INTEGER },
        ticketId: { type: SchemaType.STRING, nullable: true },
        note: { type: SchemaType.STRING, nullable: true },
      },
    },
    entryId: { type: SchemaType.INTEGER, nullable: true },
    updates: {
      type: SchemaType.OBJECT, nullable: true,
      properties: {
        date: { type: SchemaType.STRING, nullable: true },
        qty: { type: SchemaType.NUMBER, nullable: true },
        customerId: { type: SchemaType.INTEGER, nullable: true },
        activityId: { type: SchemaType.INTEGER, nullable: true },
        ticketId: { type: SchemaType.STRING, nullable: true },
        note: { type: SchemaType.STRING, nullable: true },
      },
    },
    filter: {
      type: SchemaType.OBJECT, nullable: true,
      properties: {
        from: { type: SchemaType.STRING, nullable: true },
        to: { type: SchemaType.STRING, nullable: true },
        customerId: { type: SchemaType.INTEGER, nullable: true },
      },
    },
    fill: {
      type: SchemaType.OBJECT, nullable: true,
      properties: {
        from: { type: SchemaType.STRING },
        to: { type: SchemaType.STRING },
        customerId: { type: SchemaType.INTEGER },
        activityId: { type: SchemaType.INTEGER },
        qty: { type: SchemaType.NUMBER },
        note: { type: SchemaType.STRING, nullable: true },
        onlyEmptyDays: { type: SchemaType.BOOLEAN, nullable: true },
        weekends: { type: SchemaType.BOOLEAN, nullable: true },
      },
    },
  },
  required: ['status'],
};

export async function parseAssistant(text: string, ctx: AsstContext): Promise<AsstParsed> {
  if (!genAI) return { status: 'chat', reply: 'Asistan şu an aktif değil (LLM yapılandırılmamış).' };

  const modelPriority = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash-lite'];
  // Gemini startChat geçmişi 'user' ile başlamalı ve user/model dönüşümlü olmalı.
  let conv = ctx.conversation || [];
  const firstUser = conv.findIndex((t) => t.role === 'user');
  conv = firstUser >= 0 ? conv.slice(firstUser) : [];
  // Ardışık aynı-rol turlarını birleştir (alternation garantisi)
  const merged: { role: 'user' | 'bot'; body: string }[] = [];
  for (const t of conv) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.body += '\n' + t.body;
    else merged.push({ role: t.role, body: t.body });
  }
  const history = merged.map((t) => ({ role: t.role === 'user' ? 'user' : 'model', parts: [{ text: t.body }] }));

  let json: any = null;
  for (const modelName of modelPriority) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema as any, temperature: 0.2 },
        systemInstruction: buildPrompt(ctx),
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(text);
      json = JSON.parse(result.response.text());
      break;
    } catch (err: any) {
      const msg = err?.message || '';
      if (err?.status === 429 || /429|quota/i.test(msg) || err?.status === 404 || /404/i.test(msg)) continue;
      return { status: 'chat', reply: 'Mesajı anlayamadım, biraz daha açık yazar mısın?' };
    }
  }
  if (!json) return { status: 'chat', reply: '🤖 Şu an çok yoğunum (LLM kotası). Birazdan tekrar dene.' };

  if (json.status === 'chat') return { status: 'chat', reply: json.reply || 'Buradayım! Kayıt ekleyebilir, güncelleyebilir, silebilir, doldurabilir veya rapor sorabilirsin.' };
  if (json.status === 'needs_clarification') return { status: 'needs_clarification', reply: json.reply || 'Biraz daha detay verir misin?' };

  const a = json.action;
  if (a === 'create' && json.entry) return { status: 'ok', action: 'create', entry: { date: json.entry.date, qty: Number(json.entry.qty), customerId: Number(json.entry.customerId), activityId: Number(json.entry.activityId), ticketId: json.entry.ticketId || null, note: json.entry.note || null } };
  if (a === 'update' && json.entryId && json.updates) {
    const u: any = {};
    if (json.updates.date) u.date = json.updates.date;
    if (json.updates.qty != null) u.qty = Number(json.updates.qty);
    if (json.updates.customerId) u.customerId = Number(json.updates.customerId);
    if (json.updates.activityId) u.activityId = Number(json.updates.activityId);
    if (json.updates.ticketId !== undefined) u.ticketId = json.updates.ticketId || null;
    if (json.updates.note !== undefined) u.note = json.updates.note || null;
    return { status: 'ok', action: 'update', entryId: Number(json.entryId), updates: u };
  }
  if (a === 'delete' && json.entryId) return { status: 'ok', action: 'delete', entryId: Number(json.entryId) };
  if (a === 'list') return { status: 'ok', action: 'list', filter: json.filter || {} };
  if (a === 'report') return { status: 'ok', action: 'report', filter: json.filter || {} };
  if (a === 'fill' && json.fill) return { status: 'ok', action: 'fill', fill: { from: json.fill.from, to: json.fill.to, customerId: Number(json.fill.customerId), activityId: Number(json.fill.activityId), qty: Number(json.fill.qty), note: json.fill.note || null, onlyEmptyDays: json.fill.onlyEmptyDays !== false, weekends: json.fill.weekends === true } };

  return { status: 'needs_clarification', reply: json.reply || 'Tam anlayamadım, tekrar yazar mısın?' };
}
