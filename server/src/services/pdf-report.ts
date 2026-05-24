// PDF rapor üretici — bir müşteri için aylık çalışma raporu.
// Fatura ekinde gönderilebilir, müşteri imzalayabilir.

import PDFDocument from 'pdfkit';

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
  periodLabel: string; // örn. "Mayıs 2026"
  entries: ReportEntry[];
  totalHours: number;
  totalGross: number;
  totalNet: number;
  discount: number;
  generatedAt: Date;
  generatedBy?: string;
}

const COLORS = {
  primary: '#2563EB',
  ink: '#0F172A',
  ink2: '#334155',
  ink3: '#64748B',
  paper2: '#F1F5F9',
  paper3: '#E2E8F0',
  emerald: '#10B981',
};

function fmtMoney(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function fmtDate(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * PDF'i buffer'a yazar. Hata olursa exception fırlatır (route handle eder).
 * Stream yerine buffer kullanıyoruz: mid-stream hatada response yarım kalmasın.
 */
export async function buildPdfReport(ctx: ReportContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: ctx.title,
          Author: 'TDev Aktivite Giris Sistemi',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      drawReport(doc, ctx);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawReport(doc: PDFKit.PDFDocument, ctx: ReportContext): void {

  // ── HEADER ──
  doc
    .fillColor(COLORS.primary)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('Aktivite Calisma Raporu', 40, 40);

  doc
    .fillColor(COLORS.ink3)
    .fontSize(9)
    .font('Helvetica')
    .text(`Olusturulma: ${ctx.generatedAt.toLocaleString('tr-TR')}`, 40, 70);

  if (ctx.generatedBy) {
    doc.text(`Hazirlayan: ${ctx.generatedBy}`, 40, 84);
  }

  // Period badge — sağ üstte
  doc
    .roundedRect(420, 40, 135, 40, 6)
    .fillColor(COLORS.primary)
    .fill();
  doc
    .fillColor('#FFFFFF')
    .fontSize(8)
    .font('Helvetica')
    .text('DONEM', 432, 50);
  doc
    .fillColor('#FFFFFF')
    .fontSize(14)
    .font('Helvetica-Bold')
    .text(ctx.periodLabel, 432, 62);

  // ── Müşteri bilgisi ──
  doc.moveDown(2);
  let y = 110;
  doc
    .roundedRect(40, y, 515, 60, 6)
    .fillColor(COLORS.paper2)
    .fill();

  doc
    .fillColor(COLORS.ink3)
    .fontSize(8)
    .font('Helvetica')
    .text('MUSTERI', 50, y + 10);
  doc
    .fillColor(COLORS.ink)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(ctx.customerName, 50, y + 22);
  doc
    .fillColor(COLORS.ink3)
    .fontSize(9)
    .font('Helvetica')
    .text(`Yuklenici: ${ctx.contractorName}`, 50, y + 44);

  y += 80;

  // ── Özet kartları ──
  const cards = [
    { label: 'Toplam Saat', value: `${ctx.totalHours.toFixed(1)}s`, color: COLORS.primary },
    { label: 'Brut', value: fmtMoney(ctx.totalGross), color: COLORS.ink },
    { label: 'Iskonto', value: `% ${ctx.discount.toFixed(0)}`, color: COLORS.ink3 },
    { label: 'Net', value: fmtMoney(ctx.totalNet), color: COLORS.emerald },
  ];

  const cardW = (515 - 30) / 4;
  cards.forEach((c, i) => {
    const x = 40 + i * (cardW + 10);
    doc.roundedRect(x, y, cardW, 50, 6).strokeColor(COLORS.paper3).lineWidth(1).stroke();
    doc.fillColor(COLORS.ink3).fontSize(8).font('Helvetica').text(c.label, x + 10, y + 10);
    doc.fillColor(c.color).fontSize(13).font('Helvetica-Bold').text(c.value, x + 10, y + 24);
  });

  y += 70;

  // ── Tablo başlığı ──
  doc.fillColor(COLORS.ink2).fontSize(7).font('Helvetica-Bold');
  const cols = [
    { x: 40, w: 60, label: 'TARIH' },
    { x: 100, w: 110, label: 'AKTIVITE' },
    { x: 210, w: 80, label: 'TALEP ID' },
    { x: 290, w: 165, label: 'ACIKLAMA' },
    { x: 455, w: 30, label: 'SAAT', align: 'right' as const },
    { x: 485, w: 70, label: 'NET', align: 'right' as const },
  ];

  cols.forEach((c) => {
    doc.text(c.label, c.x, y, { width: c.w, align: (c.align as any) || 'left' });
  });

  y += 14;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLORS.ink2).lineWidth(0.5).stroke();
  y += 4;

  // ── Tablo satırları ──
  doc.font('Helvetica').fontSize(8.5);
  for (const e of ctx.entries) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    const rowH = 18;

    doc.fillColor(COLORS.ink3).text(fmtDate(e.date), cols[0].x, y, { width: cols[0].w });
    doc.fillColor(COLORS.ink).text(e.activityName, cols[1].x, y, { width: cols[1].w, ellipsis: true });
    doc.fillColor(COLORS.ink3).font('Courier').fontSize(8).text(e.ticketId || '-', cols[2].x, y, { width: cols[2].w });
    doc.fillColor(COLORS.ink2).font('Helvetica').fontSize(8.5)
      .text(e.note || '-', cols[3].x, y, { width: cols[3].w, ellipsis: true, height: rowH });
    doc.fillColor(COLORS.ink).text(`${e.hours.toFixed(1)}`, cols[4].x, y, { width: cols[4].w, align: 'right' });
    doc.fillColor(COLORS.emerald).font('Helvetica-Bold').text(fmtMoney(e.net), cols[5].x, y, { width: cols[5].w, align: 'right' });
    doc.font('Helvetica').fontSize(8.5);

    y += rowH;
    // Hafif çizgi
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor(COLORS.paper3).lineWidth(0.3).stroke();
  }

  // ── Toplam satırı ──
  y += 6;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(COLORS.ink2).lineWidth(1).stroke();
  y += 8;
  doc.fillColor(COLORS.ink).fontSize(10).font('Helvetica-Bold');
  doc.text(`Toplam: ${ctx.totalHours.toFixed(1)} saat`, 40, y);
  doc.text(`Brut: ${fmtMoney(ctx.totalGross)}`, 280, y, { width: 130, align: 'right' });
  doc.fillColor(COLORS.emerald).text(`Net: ${fmtMoney(ctx.totalNet)}`, 425, y, { width: 130, align: 'right' });

  // ── Footer ──
  if (y > 720) doc.addPage();
  doc.fillColor(COLORS.ink3).fontSize(7).font('Helvetica')
    .text(
      'Bu rapor TDev Aktivite Giris Sistemi tarafindan otomatik olusturulmustur.',
      40, 800,
      { width: 515, align: 'center' }
    );
  // doc.end() buildPdfReport içinde çağrılıyor
}
