export const HOURS_PER_DAY = 8;

export function fmtMoney(n: number): string {
  return (isNaN(n) ? 0 : n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Para birimi — müşteri bazında fiyatlar farklı para biriminde olabilir.
export const CURRENCIES = [
  { code: 'TRY', symbol: '₺', label: '₺ TL' },
  { code: 'USD', symbol: '$', label: '$ Dolar' },
  { code: 'EUR', symbol: '€', label: '€ Euro' },
];

export function curSymbol(code?: string | null): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol || '₺';
}

// {TRY: 1200, USD: 400} → "1.200,00 ₺ · 400,00 $" (sıfır olanlar atlanır)
export function fmtMoneyByCurrency(byCur: Record<string, number>): string {
  const parts = Object.entries(byCur)
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([code, v]) => `${fmtMoney(v)} ${curSymbol(code)}`);
  return parts.length ? parts.join(' · ') : '0,00 ₺';
}

// Maskeleme — gizlilik anahtarı açıkken tutarlar "•••• ₺" görünür
const MASK = '••••';
export function maskMoney(n: number, code: string | undefined, masked: boolean): string {
  return masked ? `${MASK} ${curSymbol(code)}` : `${fmtMoney(n)} ${curSymbol(code)}`;
}
export function maskMoneyByCurrency(byCur: Record<string, number>, masked: boolean): string {
  return masked ? MASK : fmtMoneyByCurrency(byCur);
}

export function fmtHours(h: number): string {
  return parseFloat(h.toFixed(4)) % 1 === 0 ? `${h.toFixed(0)}s` : `${h.toFixed(1)}s`;
}

export function fmtDays(d: number): string {
  return parseFloat(d.toFixed(4)) % 1 === 0 ? d.toFixed(0) : d.toFixed(2);
}

export function qtyToHours(qty: number, unit: string): number {
  return unit === 'saat' ? qty : qty * HOURS_PER_DAY;
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

export const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
export const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const DAYS_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
