export const HOURS_PER_DAY = 8;

export function fmtMoney(n: number): string {
  return (isNaN(n) ? 0 : n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
