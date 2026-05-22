// AI Toplu Giriş — birden fazla satırlık serbest metni parse eder.
// Örnek girdi:
//   oypa destek dijital ik 9001 bt ekleme 4 saat / FO2375
//   Erdemir Satıcı kartı oluşturma 8 mayıs 2 saat
//   Şenpiliç aktivite bordro 8 mayıs 4 saat
//
// Çıktı: parsed entry listesi (henüz DB'ye yazılmamış, kullanıcı onayına sunulur).

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface BulkParseContext {
  customers: { id: number; name: string }[];
  activities: { id: number; name: string; unit: string }[];
  today: string;
  defaultActivityId?: number | null;
}

export interface BulkParsedEntry {
  rawLine: string;
  ok: boolean;
  warning?: string;
  date?: string;
  qty?: number;
  customerId?: number;
  customerName?: string;
  activityId?: number;
  activityName?: string;
  ticketId?: string | null;
  note?: string | null;
}

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    entries: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          rawLine: { type: SchemaType.STRING },
          ok: { type: SchemaType.BOOLEAN },
          warning: { type: SchemaType.STRING, nullable: true },
          date: { type: SchemaType.STRING, nullable: true },
          qty: { type: SchemaType.NUMBER, nullable: true },
          customerId: { type: SchemaType.INTEGER, nullable: true },
          activityId: { type: SchemaType.INTEGER, nullable: true },
          ticketId: { type: SchemaType.STRING, nullable: true },
          note: { type: SchemaType.STRING, nullable: true },
        },
        required: ['rawLine', 'ok'],
      },
    },
  },
  required: ['entries'],
};

function buildPrompt(ctx: BulkParseContext): string {
  const customerList = ctx.customers.map((c) => `  ${c.id}: ${c.name}`).join('\n');
  const activityList = ctx.activities
    .map((a) => `  ${a.id}: ${a.name} (${a.unit})`)
    .join('\n');
  const defAct = ctx.defaultActivityId
    ? ctx.activities.find((a) => a.id === ctx.defaultActivityId)
    : null;

  return `Sen bir SAP danışmanlık zaman kaydı parse asistanısın. Aşağıdaki SERBEST METNİ satır satır ayrıştırıp, her satırı bir aktivite kaydı objesine dönüştürmen gerekiyor.

BUGÜN: ${ctx.today}

MEVCUT MÜŞTERİLER (id: ad):
${customerList || '(yok)'}

MEVCUT AKTİVİTELER (id: ad (birim)):
${activityList || '(yok)'}

${defAct ? `VARSAYILAN AKTİVİTE: ${defAct.name} (id=${defAct.id}) — satırda aktivite belirtilmemişse bunu kullan.` : ''}

KURALLAR:
1. **Her satır = bir entry.** Boş satırları atla.
2. Müşteri ismi: kısmi eşleşme OK ama tam emin olmalısın. Bulamazsan ok=false ve warning ile sebep yaz.
3. Tarih:
   - "21.5", "21 mayıs", "8 mayıs" → o gün
   - Tarih yoksa: bugün (${ctx.today})
   - "21.05" formatları: gün.ay → bu yıl
4. Saat:
   - "4 saat", "2 saat" → numara
   - "yarım gün" = 4, "tam gün" = 8
   - Saat yoksa: ok=false, warning="Saat belirtilmemiş"
5. Ticket ID:
   - "FO2375", "JIRA-123", "ZBT-456" gibi pattern → ticketId
   - Yoksa null
6. Açıklama: kalan kısım (saat/müşteri/ticket çıkarıldıktan sonra)
7. **Belirsizlik varsa ok=false, warning ile açıkla — uygulama bunu kullanıcıya gösterip düzelttirecek.**

ÖRNEKLER:
Girdi: "oypa destek dijital ik 9001 bt ekleme 4 saat / FO2375"
Çıktı: { rawLine, ok:true, customerId:[oypa id], date:"${ctx.today}", qty:4, ticketId:"FO2375", note:"destek dijital ik 9001 bt ekleme" }

Girdi: "Erdemir Satıcı kartı oluşturma 8 mayıs 2 saat"
Çıktı: { rawLine, ok:true, customerId:[erdemir id], date:"2026-05-08", qty:2, note:"Satıcı kartı oluşturma" }

Girdi: "tek başına bir not 8 saat"
Çıktı: { rawLine, ok:false, warning:"Müşteri belirtilmemiş" }

ÇIKTI: { entries: [...] } şeklinde JSON.`;
}

export async function parseBulkText(
  text: string,
  ctx: BulkParseContext
): Promise<{ ok: boolean; entries: BulkParsedEntry[]; error?: string }> {
  if (!genAI) {
    return { ok: false, entries: [], error: 'Gemini API kullanılamıyor (env eksik)' };
  }

  const modelPriority = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.5-flash-lite',
  ];

  let lastErr: any = null;
  for (const modelName of modelPriority) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any,
          temperature: 0.1,
        },
        systemInstruction: buildPrompt(ctx),
      });
      const result = await model.generateContent(text);
      const json = JSON.parse(result.response.text());
      console.log(`✓ Bulk parse OK with ${modelName}, ${json.entries?.length} entries`);

      // Enrich with names from id'ler
      const enriched: BulkParsedEntry[] = (json.entries || []).map((e: any) => {
        const customer = e.customerId ? ctx.customers.find((c) => c.id === e.customerId) : null;
        const activity = e.activityId
          ? ctx.activities.find((a) => a.id === e.activityId)
          : ctx.defaultActivityId
          ? ctx.activities.find((a) => a.id === ctx.defaultActivityId)
          : null;
        return {
          rawLine: e.rawLine,
          ok: e.ok && !!customer && !!activity && !!e.qty,
          warning: e.warning || (!customer ? 'Müşteri eşleşmedi' : !e.qty ? 'Saat yok' : undefined),
          date: e.date || ctx.today,
          qty: e.qty || undefined,
          customerId: customer?.id,
          customerName: customer?.name,
          activityId: activity?.id,
          activityName: activity?.name,
          ticketId: e.ticketId || null,
          note: e.note || null,
        };
      });

      return { ok: true, entries: enriched };
    } catch (err: any) {
      lastErr = err;
      const is429 = err?.status === 429 || /429|quota/i.test(err?.message || '');
      const is404 = err?.status === 404 || /404|not found/i.test(err?.message || '');
      if (is429 || is404) continue;
      console.error('Bulk LLM error:', err);
      return { ok: false, entries: [], error: err.message || 'Parse hatası' };
    }
  }

  return {
    ok: false,
    entries: [],
    error: lastErr?.message || 'Tüm modeller başarısız',
  };
}
