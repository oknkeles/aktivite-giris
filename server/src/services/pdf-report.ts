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

function findAssetsDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../assets'),
    path.resolve(process.cwd(), 'assets'),
    path.resolve(process.cwd(), 'server/assets'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'logo.png'))) {
      return c;
    }
  }
  return candidates[0];
}

let FONT_DIR: string | null = null;
let ASSETS_DIR: string | null = null;
let LOGO_BUFFER: Buffer | null = null;

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
  currency?: string;
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

const CUR_LABEL: Record<string, string> = { TRY: 'TL', USD: 'USD', EUR: 'EUR' };

function makeFmtMoney(currency?: string) {
  const label = CUR_LABEL[currency || 'TRY'] || 'TL';
  return (n: number): string =>
    n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + label;
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
      if (FONT_DIR === null) FONT_DIR = findFontDir();
      let hasRoboto = false;
      try {
        const regularBuffer = fs.readFileSync(path.join(FONT_DIR, 'Roboto-Regular.ttf'));
        const boldBuffer = fs.readFileSync(path.join(FONT_DIR, 'Roboto-Bold.ttf'));
        doc.registerFont('Body', regularBuffer);
        doc.registerFont('Bold', boldBuffer);
        hasRoboto = true;
        console.log(`✓ Roboto fontları yüklendi (${regularBuffer.length} + ${boldBuffer.length} bytes)`);
      } catch (err) {
        console.error('❌ Roboto yüklenemedi:', (err as Error).message);
      }

      // Logo'yu yükle (lazy, bir kez)
      if (ASSETS_DIR === null) ASSETS_DIR = findAssetsDir();
      if (LOGO_BUFFER === null) {
        try {
          LOGO_BUFFER = fs.readFileSync(path.join(ASSETS_DIR, 'logo.png'));
          console.log(`✓ Logo yüklendi (${LOGO_BUFFER.length} bytes)`);
        } catch (err) {
          console.warn('⚠ Logo yüklenemedi:', (err as Error).message);
        }
      }

      drawReport(doc, ctx, hasRoboto, LOGO_BUFFER);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawReport(
  doc: PDFKit.PDFDocument,
  ctx: ReportContext,
  hasRoboto: boolean,
  logoBuffer: Buffer | null
): void {
  const FONT_BODY = hasRoboto ? 'Body' : 'Helvetica';
  const FONT_BOLD = hasRoboto ? 'Bold' : 'Helvetica-Bold';
  const fmtMoney = makeFmtMoney(ctx.currency);

  const pageW = 595;
  const marginX = 40;
  const contentW = pageW - marginX * 2;

  // ─── HEADER (sade) ─────────────────────────────────────
  // Logo sol üst — varsa
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, marginX, 40, { height: 30 });
    } catch (err) {
      console.warn('Logo PDF\'e gömülemedi:', (err as Error).message);
    }
  } else {
    doc.font(FONT_BOLD).fillColor(COLORS.primary).fontSize(13)
      .text('TDev Consulting', marginX, 44);
  }

  // Başlık + dönem (sağ, düz metin)
  doc.font(FONT_BOLD).fillColor(COLORS.ink).fontSize(15)
    .text('Çalışma Raporu', marginX, 42, { width: contentW, align: 'right' });
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(10)
    .text(ctx.periodLabel, marginX, 62, { width: contentW, align: 'right' });

  // İnce ayraç çizgisi
  let y = 86;
  doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
    .strokeColor(COLORS.paper3).lineWidth(1).stroke();
  y += 16;

  // ─── BİLGİ SATIRLARI (düz metin) ───────────────────────
  function infoRow(label: string, value: string): void {
    doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(9)
      .text(label, marginX, y, { width: 90, continued: false });
    doc.font(FONT_BODY).fillColor(COLORS.ink).fontSize(10)
      .text(value, marginX + 90, y - 1, { width: contentW - 90, ellipsis: true });
    y += 17;
  }
  infoRow('Müşteri', ctx.customerName);
  infoRow('Dönem', ctx.periodLabel);
  infoRow(
    'Toplam',
    `${ctx.totalHours.toFixed(1)} saat · ${ctx.entries.length} kayıt · ${fmtMoney(ctx.totalNet)}`
  );
  if (ctx.generatedBy) infoRow('Hazırlayan', ctx.generatedBy);

  y += 6;

  // ─── DETAY TABLOSU ────────────────────────────────────
  // Sütunlar: Tarih · Aktivite · Kullanıcı · Talep · Açıklama · Saat · Tutar
  const cols = [
    { x: marginX,         w: 55,  label: 'Tarih' },
    { x: marginX + 58,    w: 65,  label: 'Aktivite' },
    { x: marginX + 126,   w: 75,  label: 'Kullanıcı' },
    { x: marginX + 204,   w: 55,  label: 'Talep' },
    { x: marginX + 262,   w: 158, label: 'Açıklama' },
    { x: marginX + 422,   w: 30,  label: 'Saat',  align: 'right' as const },
    { x: marginX + 455,   w: 60,  label: 'Tutar', align: 'right' as const },
  ];

  function drawTableHeader(): void {
    doc.font(FONT_BOLD).fillColor(COLORS.ink2).fontSize(8);
    cols.forEach((c) => {
      doc.text(c.label, c.x, y, { width: c.w, align: (c.align as any) || 'left' });
    });
    y += 13;
    doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
      .strokeColor(COLORS.ink2).lineWidth(0.8).stroke();
    y += 6;
  }
  drawTableHeader();

  // Satırlar
  for (const e of ctx.entries) {
    if (y > 780) { doc.addPage(); y = 40; drawTableHeader(); }
    const rowH = 16;

    doc.font(FONT_BODY).fillColor(COLORS.ink2).fontSize(8.5)
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
    doc.font(FONT_BODY).fillColor(COLORS.ink).fontSize(8.5)
      .text(fmtMoney(e.net), cols[6].x, y, { width: cols[6].w, align: 'right' });

    y += rowH;
    doc.moveTo(marginX, y - 1).lineTo(marginX + contentW, y - 1)
      .strokeColor(COLORS.paper3).lineWidth(0.3).stroke();
  }

  // ─── TOPLAM ──────────────────────────────────────────
  if (y > 770) { doc.addPage(); y = 40; }
  y += 6;
  doc.moveTo(marginX, y).lineTo(marginX + contentW, y)
    .strokeColor(COLORS.ink2).lineWidth(0.8).stroke();
  y += 10;

  doc.font(FONT_BOLD).fillColor(COLORS.ink2).fontSize(10)
    .text(`Genel Toplam — ${ctx.totalHours.toFixed(1)} saat`, marginX, y);
  doc.font(FONT_BOLD).fillColor(COLORS.ink).fontSize(13)
    .text(fmtMoney(ctx.totalNet), marginX + contentW - 200, y - 2, {
      width: 200,
      align: 'right',
    });

  // ─── KISA BİLGİ NOTU ──────────────────────────────────
  y += 32;
  if (y > 770) { doc.addPage(); y = 40; }
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(8.5)
    .text(
      `Bu rapor ${ctx.periodLabel} dönemine ait çalışma kayıtlarını içerir. ` +
      `Sorularınız veya düzeltme talepleriniz için bizimle iletişime geçebilirsiniz.`,
      marginX, y,
      { width: contentW, lineGap: 1.5 }
    );

  // ─── FOOTER ───────────────────────────────────────────
  doc.font(FONT_BODY).fillColor(COLORS.ink3).fontSize(7)
    .text(
      `TDev Consulting · activity.tdevco.com · ${ctx.generatedAt.toLocaleDateString('tr-TR')}`,
      marginX, 815,
      { width: contentW, align: 'center' }
    );
}
