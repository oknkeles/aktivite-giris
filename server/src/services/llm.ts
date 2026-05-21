// LLM service — WhatsApp doğal dil mesajını analiz eder ve aksiyon önerir.
// Desteklediği aksiyonlar: create | update | delete | list
//
// LLM'e kullanıcının son 30 günlük kayıtları context olarak verilir ki
// "dünkü Aktek'i sil" gibi referansları doğru kayda eşleştirebilsin.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('⚠️  GEMINI_API_KEY env yok — WhatsApp bot çalışmayacak.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface RecentEntry {
  id: number;
  date: string;
  qty: number;
  unit: string;
  customerId: number;
  customerName: string;
  activityId: number;
  activityName: string;
  ticketId: string | null;
  note: string | null;
}

export interface ConversationTurn {
  role: 'user' | 'bot';
  body: string;
}

export interface ParseContext {
  customers: { id: number; name: string }[];
  activities: { id: number; name: string; unit: string }[];
  recentEntries: RecentEntry[];
  today: string;
  /** Son birkaç turun konuşma geçmişi (multi-turn diyalog için). En eski → en yeni sırada. */
  conversation?: ConversationTurn[];
}

export type ParsedAction =
  | {
      action: 'create';
      entry: {
        date: string;
        qty: number;
        customerId: number;
        activityId: number;
        ticketId: string | null;
        note: string | null;
      };
    }
  | {
      action: 'update';
      entryId: number;
      updates: {
        date?: string;
        qty?: number;
        customerId?: number;
        activityId?: number;
        ticketId?: string | null;
        note?: string | null;
      };
    }
  | {
      action: 'delete';
      entryId: number;
    }
  | {
      action: 'list';
      filter?: {
        from?: string;
        to?: string;
        customerId?: number;
      };
    };

export interface ParsedResponse {
  ok: boolean;
  result?: ParsedAction;
  clarification?: string;
  raw?: any;
}

function buildSystemPrompt(ctx: ParseContext): string {
  const customerList = ctx.customers
    .map((c) => `  ${c.id}: ${c.name}`)
    .join('\n');
  const activityList = ctx.activities
    .map((a) => `  ${a.id}: ${a.name} (${a.unit})`)
    .join('\n');

  const recentList =
    ctx.recentEntries.length > 0
      ? ctx.recentEntries
          .map(
            (e) =>
              `  #${e.id}: ${e.date} · ${e.customerName} · ${e.activityName} · ${e.qty}${e.unit === 'saat' ? 's' : 'g'}${
                e.ticketId ? ` (${e.ticketId})` : ''
              }${e.note ? ` — ${e.note.substring(0, 40)}` : ''}`
          )
          .join('\n')
      : '  (henüz kayıt yok)';

  return `Sen bir SAP danışmanlık şirketinin aktivite kayıt asistanısın. Kullanıcının Türkçe mesajından AKSİYON çıkarman gerekiyor.

BUGÜN: ${ctx.today}

AKSİYON TÜRLERİ:
- create: yeni kayıt oluştur ("bugün 8 saat Aktek...")
- update: var olan kaydı güncelle ("dünkü Aktek'i 6 saate çevir", "şu kaydın saatini 4 yap")
- delete: kayıt sil ("son kaydımı sil", "dünkü beymen'i sil", "#42 sil")
- list: kayıt listele ("bu haftaki kayıtlarım", "Aktek için ne yapmışım")

MEVCUT MÜŞTERİLER (id: ad):
${customerList || '  (henüz yok)'}

MEVCUT AKTİVİTELER (id: ad (birim)):
${activityList || '  (henüz yok)'}

KULLANICININ SON KAYITLARI (en yenilerden):
${recentList}

KURALLAR:
1. "bugün" = ${ctx.today}, "dün" = bir önceki gün, "geçen cuma" gibi ifadeleri doğru yorumla.
2. CREATE için: customerId, activityId, date, qty zorunlu.
3. UPDATE/DELETE için: yukarıdaki son kayıtlardan eşleşeni bul, **entryId**'yi (#'siz, sadece sayı) kullan.
4. UPDATE için "updates" objesi sadece DEĞİŞTİRİLECEK alanları içersin.
5. Saat: "8 saat" → 8, "yarım gün" → 4, "tam gün" → 8.
6. Eşleşme belirsizse veya birden fazla aday varsa → status:"needs_clarification" + kısa Türkçe soru.
7. "Sil" komutunda eğer son kayıtlarda eşleşme yoksa → clarification iste.
8. **KONUŞMA TARİHÇESİ KRİTİK:** Daha önceki turlarında soru sorduysan ve kullanıcı şimdi cevap veriyorsa, eski mesajla yeni cevabı BİRLEŞTİRİP tamamlanmış aksiyonu çıkar.
   Örnek: önceki tur "28.5 5 saat" + senin sorun "hangi müşteri ve aktivite?" + yeni cevap "Aktek Expert Test" = action:create, date:2026-05-28, qty:5, customerId:[Aktek], activityId:[Expert], note:"Test"

ÖRNEKLER:
- "bugün 8 saat Aktek FIORI dashboard" → action:create
- "dünkü Beymen'i 4 saate çevir" → action:update, entryId:[dünkü beymen'in id'si], updates:{qty:4}
- "son kaydımı sil" → action:delete, entryId:[son kaydın id'si]
- "bu haftaki kayıtlarım" → action:list, filter:{from:..., to:...}
- "Aktek için yarım gün, JIRA-100" → ambiguous (hangi gün?) → needs_clarification

ÇIKTI: Sadece JSON şeması.`;
}

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    status: {
      type: SchemaType.STRING,
      enum: ['ok', 'needs_clarification'],
    },
    action: {
      type: SchemaType.STRING,
      enum: ['create', 'update', 'delete', 'list'],
      nullable: true,
    },
    // create
    entry: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        date: { type: SchemaType.STRING },
        qty: { type: SchemaType.NUMBER },
        customerId: { type: SchemaType.INTEGER },
        activityId: { type: SchemaType.INTEGER },
        ticketId: { type: SchemaType.STRING, nullable: true },
        note: { type: SchemaType.STRING, nullable: true },
      },
    },
    // update / delete
    entryId: { type: SchemaType.INTEGER, nullable: true },
    updates: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        date: { type: SchemaType.STRING, nullable: true },
        qty: { type: SchemaType.NUMBER, nullable: true },
        customerId: { type: SchemaType.INTEGER, nullable: true },
        activityId: { type: SchemaType.INTEGER, nullable: true },
        ticketId: { type: SchemaType.STRING, nullable: true },
        note: { type: SchemaType.STRING, nullable: true },
      },
    },
    // list
    filter: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        from: { type: SchemaType.STRING, nullable: true },
        to: { type: SchemaType.STRING, nullable: true },
        customerId: { type: SchemaType.INTEGER, nullable: true },
      },
    },
    clarification: { type: SchemaType.STRING, nullable: true },
  },
  required: ['status'],
};

export async function parseWhatsAppMessage(
  text: string,
  ctx: ParseContext
): Promise<ParsedResponse> {
  if (!genAI) {
    return {
      ok: false,
      clarification: 'Bot şu an aktif değil. Yöneticinizle iletişime geçin.',
    };
  }

  // Gemini model fallback zinciri — ilki 429 verirse sıradakine geçer.
  // Hesabımızda çalıştığı doğrulanan modeller (404 alanlar listeden çıkarıldı).
  const modelPriority = [
    'gemini-2.5-flash',      // birincil — kalite + hız dengesi
    'gemini-2.0-flash',      // hızlı yedek
    'gemini-1.5-flash',      // stabil eski yedek
    'gemini-2.5-flash-lite', // en ucuz son çare
  ];

  // Konuşma geçmişini Gemini formatına çevir (en eski → en yeni)
  const history = (ctx.conversation || []).map((t) => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.body }],
  }));

  let json: any = null;
  let lastErr: any = null;
  for (const modelName of modelPriority) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any,
          temperature: 0.2,
        },
        systemInstruction: buildSystemPrompt(ctx),
      });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(text);
      json = JSON.parse(result.response.text());
      console.log(`✓ LLM parse OK with ${modelName}, action=${json.action}, history=${history.length}`);
      break;
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || '';
      const is429 = err?.status === 429 || /429|quota|rate.?limit/i.test(msg);
      const is404 = err?.status === 404 || /404|not found/i.test(msg);
      if (is429) {
        console.warn(`⚠ ${modelName} quota exceeded, trying next...`);
        continue;
      }
      if (is404) {
        console.warn(`⚠ ${modelName} model bulunamadı, atlanıyor...`);
        continue;
      }
      // Diğer hatalarda fallback yapma — gerçek bir problem var
      console.error('LLM error (non-quota/non-404):', err);
      return {
        ok: false,
        clarification: 'Mesajı anlayamadım, daha açık yazar mısın?',
      };
    }
  }

  if (!json) {
    console.error('All Gemini models quota exhausted:', lastErr?.message);
    return {
      ok: false,
      clarification:
        '🤖 Bot şu an çok yoğun (LLM kotası doldu). Birkaç dakika sonra tekrar dene.',
    };
  }

  if (json.status !== 'ok' || !json.action) {
    return {
      ok: false,
      clarification: json.clarification || 'Mesajı anlayamadım.',
      raw: json,
    };
  }

  // Aksiyona göre cevabı şekillendir
  if (json.action === 'create' && json.entry) {
    return {
      ok: true,
      result: {
        action: 'create',
        entry: {
          date: json.entry.date,
          qty: Number(json.entry.qty),
          customerId: Number(json.entry.customerId),
          activityId: Number(json.entry.activityId),
          ticketId: json.entry.ticketId || null,
          note: json.entry.note || null,
        },
      },
      raw: json,
    };
  }

  if (json.action === 'update' && json.entryId && json.updates) {
    const u: any = {};
    if (json.updates.date) u.date = json.updates.date;
    if (json.updates.qty !== undefined && json.updates.qty !== null)
      u.qty = Number(json.updates.qty);
    if (json.updates.customerId)
      u.customerId = Number(json.updates.customerId);
    if (json.updates.activityId)
      u.activityId = Number(json.updates.activityId);
    if (json.updates.ticketId !== undefined)
      u.ticketId = json.updates.ticketId || null;
    if (json.updates.note !== undefined)
      u.note = json.updates.note || null;

    return {
      ok: true,
      result: { action: 'update', entryId: Number(json.entryId), updates: u },
      raw: json,
    };
  }

  if (json.action === 'delete' && json.entryId) {
    return {
      ok: true,
      result: { action: 'delete', entryId: Number(json.entryId) },
      raw: json,
    };
  }

  if (json.action === 'list') {
    return {
      ok: true,
      result: {
        action: 'list',
        filter: json.filter || undefined,
      },
      raw: json,
    };
  }

  return {
    ok: false,
    clarification: json.clarification || 'Mesajı tam anlayamadım.',
    raw: json,
  };
}
