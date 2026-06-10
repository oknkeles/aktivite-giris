// Dönem kilidi kontrolü — kilitli aya (YYYY-MM) ait kayıtlar değiştirilemez.
// Mutabakat gönderilen ay kilitlenir; müşteriye verilen belge ile sistemdeki
// veri ayrışmasın diye create/update/delete tüm kanallarda (web + WhatsApp) engellenir.

import { prisma } from '../db.js';

export function periodOf(date: string): string {
  return date.slice(0, 7); // YYYY-MM-DD → YYYY-MM
}

/** Tek tarih kilitli mi? */
export async function isDateLocked(date: string): Promise<boolean> {
  const lock = await prisma.periodLock.findUnique({
    where: { period: periodOf(date) },
  });
  return !!lock;
}

/**
 * Tarih listesi içinde kilitli döneme düşen var mı?
 * Varsa kilitli dönemleri döner (hata mesajında kullanılır), yoksa boş dizi.
 */
export async function lockedPeriodsAmong(dates: string[]): Promise<string[]> {
  const periods = [...new Set(dates.map(periodOf))];
  const locks = await prisma.periodLock.findMany({
    where: { period: { in: periods } },
    select: { period: true },
  });
  return locks.map((l) => l.period);
}

export function lockedError(periods: string[]): string {
  return `Bu dönem kilitli (${periods.join(', ')}). Mutabakat gönderilen aylarda değişiklik yapılamaz — gerekiyorsa yönetici kilidi açabilir.`;
}
