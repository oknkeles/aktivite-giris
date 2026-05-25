// PDF rapor üretici — sade, fiziksel basıma uygun mutabakat formatı.
// Türkçe karakter için Roboto TTF kullanır.

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Font yolu — birden fazla olası konumu dene (Railway, local dev, bundled)
function findFontDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../assets/fonts'),         // dist/services → server/assets/fonts
    path.resolve(process.cwd(), 'assets/fonts'),           // CWD = server/
    path.resolve(process.cwd(), 'server/assets/fonts'),    // CWD = /app/
    path.resolve(__dirname, '../assets/fonts'),            // fallback
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'Roboto-Regular.ttf'))) {
      console.log(`✓ PDF fontları bulundu: ${c}`);
      return c;
    }
  }
  console.warn('⚠ Roboto TTF bulunamadı, denenen yollar:', candidates);
  return candidates[0];
}

let FONT_DIR: string | null = null;

export interface ReportEntry {
  date: string;
  customerName: string;
  contractorName: string;
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
  discount: number;
  generatedAt: Date;
  generatedBy?: string;
}

const COLORS = {
  primary: '#0F2440',
  accent: '#F5A623',
  ink: '#0F172A',
  ink2: '#334155',
  ink3: '#64748B',
  paper2: '#F1F5F9',
  paper3: '#E2E8F0',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function fmtDate(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function buildPdfReport(ctx: ReportContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: { Title: ctx.title, Author: 'TDev Consulting' },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Türkçe destekli font kayıt — file buffer olarak okuyup veriyoruz
      // ki path/permission sorunlarında net hata mesajı görelim.
      if (FONT_DIR === null) FONT_DIR = findFontDir();
      let hasRoboto = false;
      try {
        const regularPath = path.join(FONT_DIR, 'Roboto-Regular.ttf');
        const boldPath = path.join(FONT_DIR, 'Roboto-Bold.ttf');
        const regularBuffer = fs.readFileSync(regularPath);
        const boldBuffer = fs.readFileSync(boldPath);
        doc.registerFont('Body', regularBuffer);
        doc.registerFont('Bold', boldBuffer);
        hasRoboto = true;
        console.log(`✓ Roboto fontları yüklendi (${regularBuffer.length} + ${boldBuffer.length} bytes)`);
      } catch (err) {
        console.error('❌ Roboto yüklenemedi:', (err as Error).message);
      }

      drawReport(doc, ctx, hasRoboto);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawReport(doc: PDFKit.PDFDocument, ctx: ReportContext, hasRoboto: boolean): void {
  const FONT_BODY = hasRoboto ? 'Body' : 'Helvetica';
  const FONT_BOLD = hasRoboto ? 'Bold' : 'Helvetica-Bold';

  const pageW = 595;
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  // ─── HEADER ───────────────────────────────────────────
  doc.font(FONT_BOLD).fillColor(COLORS.primary).fontSize(11)
    .text('TDev Consulting', marginX, 40);
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8)
    .text('tdevco.com · activity.tdevco.com', marginX, 55);

  doc.font(FONT_BOLD).fillColor(COLORS.primary).fontSize(20)
    .text('Aktivite Çalışma Raporu', marginX, 76);

  // Dönem badge
  const badgeX = pageW - marginX - 140;
  doc.roundedRect(badgeX, 40, 140, 40, 6).fillColor(COLORS.primary).fill();
  doc.font(FONT_BODY).fillColor('#FFFFFF').fontSize(8).opacity(0.7)
    .text('DÖNEM', badgeX + 12, 49);
  doc.opacity(1);
  doc.font(FONT_BOLD).fillColor('#FFFFFF').fontSize(14)
    .text(ctx.periodLabel, badgeX + 12, 60);

  // ─── MÜŞTERİ + ÖZET (tek satır) ────────────────────────
  let y = 112;
  // Müşteri kutusu
  doc.roundedRect(marginX, y, contentW * 0.55, 56, 6).fillColor(COLORS.paper2).fill();
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8)
    .text('MÜŞTERİ', marginX + 12, y + 10);
  doc.font(FONT_BOLD).fillColor(COLORS.primary).fontSize(14)
    .text(ctx.customerName, marginX + 12, y + 22, { width: contentW * 0.55 - 24, ellipsis: true });
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8)
    .text(
      `Oluşturulma: ${ctx.generatedAt.toLocaleDateString('tr-TR')}` +
      (ctx.generatedBy ? ` · Hazırlayan: ${ctx.generatedBy}` : ''),
      marginX + 12, y + 41
    );

  // Tutar kartı (sağ, vurgulu)
  const tutarX = marginX + contentW * 0.55 + 10;
  const tutarW = contentW - (contentW * 0.55 + 10);
  doc.roundedRect(tutarX, y, tutarW, 56, 6).fillColor(COLORS.primary).fill();
  doc.font(FONT_BODY).fillColor('#FFFFFF').fontSize(8).opacity(0.7)
    .text('TOPLAM', tutarX + 14, y + 10);
  doc.opacity(1);
  doc.font(FONT_BOLD).fillColor('#FFFFFF').fontSize(18)
    .text(`${ctx.totalHours.toFixed(1)} saat`, tutarX + 14, y + 22);
  doc.font(FONT_BOLD).fillColor(COLORS.accent).fontSize(14)
    .text(fmtMoney(ctx.totalNet), tutarX + 14, y + 40);

  y += 80;

  // ─── DETAY TABLOSU ────────────────────────────────────
  // Sütunlar: Tarih · Aktivite · Kullanıcı · Talep · Açıklama · Saat · Tutar
  const cols = [
    { x: marginX,         w: 55,  label: 'TARİH' },
    { x: marginX + 58,    w: 65,  label: 'AKTİVİTE' },
    { x: marginX + 126,   w: 75,  label: 'KULLANICI' },
    { x: marginX + 204,   w: 55,  label: 'TALEP' },
    { x: marginX + 262,   w: 158, label: 'AÇIKLAMA' },
    { x: marginX + 422,   w: 30,  label: 'SAAT',  align: 'right' as const },
    { x: marginX + 455,   w: 60,  label: 'TUTAR', align: 'right' as const },
  ];

  // Header
  doc.font(FONT_BOLD).fillColor(COLORS.ink3).fontSize(7.5);
  cols.forEach((c) => {
    doc.text(c.label, c.x, y, { width: c.w, align: (c.align as any) || 'left' });
  });
  y += 12;
  doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
    .strokeColor(COLORS.ink2).lineWidth(0.6).stroke();
  y += 5;

  // Satırlar
  for (const e of ctx.entries) {
    if (y > 770) { doc.addPage(); y = 40; }
    const rowH = 16;

    doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8.5)
      .text(fmtDate(e.date), cols[0].x, y, { width: cols[0].w });
    doc.font(FONT_BODY).fillColor(COLORS.ink).fontSize(8.5)
      .text(e.activityName, cols[1].x, y, { width: cols[1].w, ellipsis: true });
    doc.font(FONT_BODY).fillColor(COLORS.ink2).fontSize(8.5)
      .text(e.userName || '—', cols[2].x, y, { width: cols[2].w, ellipsis: true });
    doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8)
      .text(e.ticketId || '—', cols[3].x, y, { width: cols[3].w, ellipsis: true });
    doc.font(FONT_BODY).fillColor(COLORS.ink2).fontSize(8)
      .text(e.note || '—', cols[4].x, y, { width: cols[4].w, ellipsis: true, height: rowH });
    doc.font(FONT_BODY).fillColor(COLORS.ink).fontSize(8.5)
      .text(e.hours.toFixed(1), cols[5].x, y, { width: cols[5].w, align: 'right' });
    doc.font(FONT_BOLD).fillColor(COLORS.primary).fontSize(8.5)
      .text(fmtMoney(e.net), cols[6].x, y, { width: cols[6].w, align: 'right' });

    y += rowH;
    doc.moveTo(marginX, y - 1).lineTo(marginX + contentW, y - 1)
      .strokeColor(COLORS.paper3).lineWidth(0.3).stroke();
  }

  // ─── TOPLAM ──────────────────────────────────────────
  y += 8;
  doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
    .strokeColor(COLORS.primary).lineWidth(1.2).stroke();
  y += 10;

  doc.font(FONT_BOLD).fillColor(COLORS.ink2).fontSize(11)
    .text(`Toplam: ${ctx.totalHours.toFixed(1)} saat`, marginX, y);
  doc.font(FONT_BOLD).fillColor(COLORS.primary).fontSize(14)
    .text(fmtMoney(ctx.totalNet), marginX + contentW - 200, y - 2, {
      width: 200,
      align: 'right',
    });

  // ─── KISA NOT (mutabakat metni — kompakt) ─────────────
  y += 36;
  if (y > 760) { doc.addPage(); y = 40; }
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8)
    .text(
      `Bu rapor ${ctx.periodLabel} dönemine ait çalışma kayıtlarını içerir. ` +
      `İtiraz veya düzeltme talepleri için tarafımıza yazılı olarak bildirim yapılması rica olunur.`,
      marginX, y,
      { width: contentW, lineGap: 1.5 }
    );

  // ─── FOOTER ───────────────────────────────────────────
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(7)
    .text(
      `TDev Consulting · activity.tdevco.com · Sayfa otomatik oluşturulmuştur (${ctx.generatedAt.toLocaleDateString('tr-TR')})`,
      marginX, 815,
      { width: contentW, align: 'center' }
    );
}
