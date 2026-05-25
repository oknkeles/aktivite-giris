// PDF rapor üretici — müşteri mutabakatı formatında, müşteriye doğrudan gönderilebilir.
// Tek tutar (net) gösterilir, yüklenici/iskonto/brüt detayları gizlenir.

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compile sonrası dosya yolu: server/dist/services/pdf-report.js
// Font yolu: server/assets/fonts/Roboto-*.ttf
// Geriye gidiş: dist/services → dist → server → assets/fonts
const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');

export interface ReportEntry {
  date: string;
  customerName: string;
  contractorName: string; // backend hâlâ döner ama PDF göstermez
  activityName: string;
  ticketId: string | null;
  note: string | null;
  hours: number;
  days: number;
  dayRate: number;
  gross: number;
  net: number;
  userName?: string;
}

export interface ReportContext {
  title: string;
  customerName: string;
  contractorName: string;
  periodLabel: string;
  entries: ReportEntry[];
  totalHours: number;
  totalGross: number;
  totalNet: number;
  discount: number; // PDF'de gösterilmez, sadece backend için
  generatedAt: Date;
  generatedBy?: string;
}

const COLORS = {
  primary: '#0F2440',      // Logo navy
  accent: '#F5A623',       // Logo orange
  ink: '#0F172A',
  ink2: '#334155',
  ink3: '#64748B',
  paper2: '#F1F5F9',
  paper3: '#E2E8F0',
  emerald: '#10B981',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function fmtDate(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * PDF'i buffer'a yazar. Türkçe karakter için Roboto TTF kullanır.
 */
export async function buildPdfReport(ctx: ReportContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: ctx.title,
          Author: 'TDev Consulting',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Türkçe destekli font kayıt
      try {
        doc.registerFont('Body', path.join(FONT_DIR, 'Roboto-Regular.ttf'));
        doc.registerFont('Bold', path.join(FONT_DIR, 'Roboto-Bold.ttf'));
      } catch (err) {
        console.warn('Roboto font yüklenemedi, Helvetica kullanılıyor:', err);
      }

      drawReport(doc, ctx);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function font(doc: PDFKit.PDFDocument, weight: 'Body' | 'Bold' = 'Body'): PDFKit.PDFDocument {
  try {
    return doc.font(weight);
  } catch {
    return doc.font(weight === 'Bold' ? 'Helvetica-Bold' : 'Helvetica');
  }
}

function drawReport(doc: PDFKit.PDFDocument, ctx: ReportContext): void {
  const pageW = 595; // A4 width
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  // ─── HEADER ───────────────────────────────────────────
  // Sol: Şirket adı + başlık
  font(doc, 'Bold').fillColor(COLORS.primary).fontSize(11)
    .text('TDev Consulting', marginX, 40);
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8)
    .text('tdevco.com', marginX, 55);

  font(doc, 'Bold').fillColor(COLORS.primary).fontSize(22)
    .text('Aktivite Çalışma Raporu', marginX, 78);

  // Sağ: Dönem badge
  const badgeX = pageW - marginX - 140;
  doc.roundedRect(badgeX, 40, 140, 44, 6).fillColor(COLORS.primary).fill();
  font(doc, 'Body').fillColor('#FFFFFF').fontSize(8)
    .text('DÖNEM', badgeX + 12, 50);
  font(doc, 'Bold').fillColor('#FFFFFF').fontSize(15)
    .text(ctx.periodLabel, badgeX + 12, 62);

  // ─── MÜŞTERİ BİLGİ ────────────────────────────────────
  let y = 120;
  doc.roundedRect(marginX, y, contentW, 50, 6).fillColor(COLORS.paper2).fill();
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8)
    .text('MÜŞTERİ', marginX + 12, y + 10);
  font(doc, 'Bold').fillColor(COLORS.primary).fontSize(15)
    .text(ctx.customerName, marginX + 12, y + 22);

  // Sağda: hazırlayan + tarih
  const metaX = marginX + contentW - 220;
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8)
    .text(`Oluşturulma: ${ctx.generatedAt.toLocaleString('tr-TR')}`, metaX, y + 14, { width: 210, align: 'right' });
  if (ctx.generatedBy) {
    font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8)
      .text(`Hazırlayan: ${ctx.generatedBy}`, metaX, y + 28, { width: 210, align: 'right' });
  }

  y += 70;

  // ─── ÖZET KARTLARI (2 kart: Toplam Saat + Tutar) ──────
  const cardW = (contentW - 12) / 2;
  // Toplam Saat
  doc.roundedRect(marginX, y, cardW, 60, 6).strokeColor(COLORS.paper3).lineWidth(1).stroke();
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(9)
    .text('TOPLAM SAAT', marginX + 14, y + 12);
  font(doc, 'Bold').fillColor(COLORS.primary).fontSize(22)
    .text(`${ctx.totalHours.toFixed(1)} saat`, marginX + 14, y + 28);

  // Tutar
  const card2X = marginX + cardW + 12;
  doc.roundedRect(card2X, y, cardW, 60, 6).fillColor(COLORS.primary).fill();
  font(doc, 'Body').fillColor('#FFFFFF').fontSize(9).opacity(0.7)
    .text('TUTAR', card2X + 14, y + 12);
  doc.opacity(1);
  font(doc, 'Bold').fillColor('#FFFFFF').fontSize(22)
    .text(fmtMoney(ctx.totalNet), card2X + 14, y + 28);

  y += 80;

  // ─── DETAY TABLOSU ────────────────────────────────────
  font(doc, 'Bold').fillColor(COLORS.ink).fontSize(10)
    .text('Detay', marginX, y);
  y += 18;

  // Sütun düzeni
  const cols = [
    { x: marginX, w: 60, label: 'TARİH' },
    { x: marginX + 65, w: 80, label: 'AKTİVİTE' },
    { x: marginX + 150, w: 70, label: 'TALEP ID' },
    { x: marginX + 225, w: 200, label: 'AÇIKLAMA' },
    { x: marginX + 430, w: 35, label: 'SAAT', align: 'right' as const },
    { x: marginX + 470, w: 45, label: 'TUTAR', align: 'right' as const },
  ];

  // Header
  font(doc, 'Bold').fillColor(COLORS.ink3).fontSize(7.5);
  cols.forEach((c) => {
    doc.text(c.label, c.x, y, { width: c.w, align: (c.align as any) || 'left' });
  });
  y += 12;
  doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
    .strokeColor(COLORS.ink2).lineWidth(0.6).stroke();
  y += 6;

  // Satırlar
  font(doc, 'Body').fontSize(9);
  for (const e of ctx.entries) {
    if (y > 760) { doc.addPage(); y = 40; }
    const rowH = 20;

    font(doc, 'Body').fillColor(COLORS.ink3).fontSize(9)
      .text(fmtDate(e.date), cols[0].x, y, { width: cols[0].w });

    font(doc, 'Body').fillColor(COLORS.ink).fontSize(9)
      .text(e.activityName, cols[1].x, y, { width: cols[1].w, ellipsis: true });

    font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8.5)
      .text(e.ticketId || '—', cols[2].x, y, { width: cols[2].w, ellipsis: true });

    font(doc, 'Body').fillColor(COLORS.ink2).fontSize(8.5)
      .text(e.note || '—', cols[3].x, y, { width: cols[3].w, ellipsis: true, height: rowH });

    font(doc, 'Body').fillColor(COLORS.ink).fontSize(9)
      .text(e.hours.toFixed(1), cols[4].x, y, { width: cols[4].w, align: 'right' });

    font(doc, 'Bold').fillColor(COLORS.primary).fontSize(9)
      .text(fmtMoney(e.net), cols[5].x, y, { width: cols[5].w, align: 'right' });

    y += rowH;
    doc.moveTo(marginX, y - 2).lineTo(marginX + contentW, y - 2)
      .strokeColor(COLORS.paper3).lineWidth(0.3).stroke();
  }

  // ─── TOPLAM ──────────────────────────────────────────
  y += 6;
  doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
    .strokeColor(COLORS.primary).lineWidth(1.2).stroke();
  y += 10;

  font(doc, 'Bold').fillColor(COLORS.ink2).fontSize(11)
    .text(`Toplam: ${ctx.totalHours.toFixed(1)} saat`, marginX, y);
  font(doc, 'Bold').fillColor(COLORS.primary).fontSize(14)
    .text(fmtMoney(ctx.totalNet), marginX + contentW - 200, y - 2, {
      width: 200,
      align: 'right',
    });

  // ─── MUTABAKAT NOTU ───────────────────────────────────
  y += 50;
  if (y > 700) { doc.addPage(); y = 40; }

  doc.roundedRect(marginX, y, contentW, 70, 6).fillColor(COLORS.paper2).fill();
  font(doc, 'Bold').fillColor(COLORS.ink).fontSize(9)
    .text('Mutabakat', marginX + 14, y + 12);
  font(doc, 'Body').fillColor(COLORS.ink2).fontSize(8.5)
    .text(
      `Yukarıdaki ${ctx.periodLabel} dönemine ait çalışma kayıtları, tarafımızca kontrol edilmiş ve mutabık kalınmıştır. ` +
      `Toplam çalışma süresi ${ctx.totalHours.toFixed(1)} saat olup, toplam tutar ${fmtMoney(ctx.totalNet)} olarak ` +
      `hesaplanmıştır. İtiraz halinde 7 iş günü içinde tarafımıza yazılı olarak bildirilmediği takdirde, ` +
      `bu rapor onaylanmış sayılır.`,
      marginX + 14, y + 28,
      { width: contentW - 28, lineGap: 2 }
    );

  // ─── İMZA ALANI ───────────────────────────────────────
  y += 90;
  if (y > 730) { doc.addPage(); y = 40; }

  const sigW = (contentW - 20) / 2;
  // Sol: Hazırlayan
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8)
    .text('Hazırlayan (TDev Consulting)', marginX, y);
  doc.moveTo(marginX, y + 30).lineTo(marginX + sigW, y + 30)
    .strokeColor(COLORS.ink3).lineWidth(0.5).stroke();
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(7.5)
    .text('İmza / Tarih', marginX, y + 34);

  // Sağ: Müşteri onayı
  const sig2X = marginX + sigW + 20;
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(8)
    .text(`Onaylayan (${ctx.customerName})`, sig2X, y);
  doc.moveTo(sig2X, y + 30).lineTo(sig2X + sigW, y + 30)
    .strokeColor(COLORS.ink3).lineWidth(0.5).stroke();
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(7.5)
    .text('İmza / Tarih', sig2X, y + 34);

  // ─── FOOTER ───────────────────────────────────────────
  font(doc, 'Body').fillColor(COLORS.ink3).fontSize(7)
    .text(
      `Bu rapor TDev Aktivite Giriş Sistemi tarafından otomatik oluşturulmuştur · ${ctx.generatedAt.toLocaleDateString('tr-TR')}`,
      marginX, 815,
      { width: contentW, align: 'center' }
    );
}
