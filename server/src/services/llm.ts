// LLM service — WhatsApp mesajından structured Entry verisini çıkartır.
// Provider: Google Gemini 2.5 Flash (ücretsiz tier yeterli)
// Yapısı sağlayıcı-nötr — ileride GPT-mini fallback eklemek kolay.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('⚠️  GEMINI_API_KEY env yok — WhatsApp bot çalışmayacak.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface ParseContext {
  customers: { id: number; name: string }[];
  activities: { id: number; name: string; unit: string }[];
  /** Bugünün tarihi (Türkiye saati, YYYY-MM-DD) — "bugün", "dün" gibi
   *  ifadeleri yorumlamak için. */
  today: string;
}

export interface ParsedEntry {
  ok: boolean;
  /** Parse başarılıysa entry verisi. */
  entry?: {
    date: string; // YYYY-MM-DD
    qty: number;
    customerId: number;
    activityId: number;
    ticketId: string | null;
    note: string | null;
  };
  /** Parse edilemediyse veya belirsizse: kullanıcıya gönderilecek soru. */
  clarification?: string;
  /** Debug için ham model çıktısı. */
  raw?: any;
}

function buildSystemPrompt(ctx: ParseContext): string {
  const customerList = ctx.customers
    .map((c) => `- ${c.id}: ${c.name}`)
    .join('\n');
  const activityList = ctx.activities
    .map((a) => `- ${a.id}: ${a.name} (${a.unit})`)
    .join('\n');

  return `Sen bir SAP danışmanlık şirketinin aktivite kayıt asistanısın. Kullanıcının Türkçe doğal dil mesajından aktivite kaydı çıkarman gerekiyor.

BUGÜN: ${ctx.today}

MEVCUT MÜŞTERİLER (id: ad):
${customerList || '(henüz yok)'}

MEVCUT AKTİVİTE TÜRLERİ (id: ad (birim)):
${activityList || '(henüz yok)'}

KURALLAR:
1. "bugün" = ${ctx.today}, "dün" = bir önceki gün, "geçen cuma" gibi ifadeleri doğru yorumla.
2. Müşteri adını eşleştir — kısmi eşleşme OK ama net olmalı. Belirsizse "ambiguous" döndür.
3. Aktivite türü adını da eşleştir; en yaygın varsayılan "Expert" veya benzer şey listede varsa onu seç.
4. Süre saat cinsinden (örn. "8 saat" → 8, "yarım gün" → 4, "tam gün" → 8).
5. Talep ID (JIRA-123, ZBT-456 gibi) varsa ticketId'ye yaz, yoksa null.
6. Açıklama serbest metin — özetleyerek note'a yaz, yoksa null.
7. Eğer müşteri veya aktivite eşleşmiyorsa veya saat belirtilmemişse "needs_clarification" döndür ve kullanıcıya kısa, net bir soru yaz.

ÖRNEKLER:
- "bugün 8 saat Aktek SAP danışmanlık FIORI dashboard" → date:bugün, qty:8, customer:Aktek, activity:SAP danışmanlık/Expert, note:FIORI dashboard
- "dün yarım gün Beymen JIRA-123" → date:dün, qty:4, customer:Beymen, ticketId:JIRA-123
- "8 saat" → needs_clarification: "Hangi müşteri ve aktivite için?"

ÇIKTI: Yalnızca JSON şeması ile cevap ver.`;
}

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    status: {
      type: SchemaType.STRING,
      enum: ['ok', 'needs_clarification'],
    },
    entry: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        date: { type: SchemaType.STRING, description: 'YYYY-MM-DD' },
        qty: { type: SchemaType.NUMBER },
        customerId: { type: SchemaType.INTEGER },
        activityId: { type: SchemaType.INTEGER },
        ticketId: { type: SchemaType.STRING, nullable: true },
        note: { type: SchemaType.STRING, nullable: true },
      },
      required: ['date', 'qty', 'customerId', 'activityId'],
    },
    clarification: {
      type: SchemaType.STRING,
      nullable: true,
      description: 'Kullanıcıya gönderilecek kısa, net Türkçe soru.',
    },
  },
  required: ['status'],
};

export async function parseWhatsAppMessage(
  text: string,
  ctx: ParseContext
): Promise<ParsedEntry> {
  if (!genAI) {
    return {
      ok: false,
      clarification: 'Bot şu an aktif değil. Yöneticinizle iletişime geçin.',
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema as any,
        temperature: 0.2,
      },
      systemInstruction: buildSystemPrompt(ctx),
    });

    const result = await model.generateContent(text);
    const json = JSON.parse(result.response.text());

    if (json.status === 'ok' && json.entry) {
      return {
        ok: true,
        entry: {
          date: json.entry.date,
          qty: Number(json.entry.qty),
          customerId: Number(json.entry.customerId),
          activityId: Number(json.entry.activityId),
          ticketId: json.entry.ticketId || null,
          note: json.entry.note || null,
        },
        raw: json,
      };
    }

    return {
      ok: false,
      clarification: json.clarification || 'Mesajı anlayamadım. Lütfen daha açık yaz.',
      raw: json,
    };
  } catch (err: any) {
    console.error('LLM parse error:', err);
    return {
      ok: false,
      clarification: 'Bot şu an cevap veremiyor. Tekrar dener misin?',
    };
  }
}
