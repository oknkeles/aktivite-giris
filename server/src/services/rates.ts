// Tarih-bazlı rate seçimi — bir kaydın tarihini kapsayan dönemin rate'ini döner.
// effectiveFrom <= date <= effectiveTo (effectiveTo null = sonsuz).
// ISO tarih (YYYY-MM-DD) string karşılaştırması sözlüksel olarak doğru çalışır.

export interface DatedRate {
  activityId: number;
  rate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function rateForDate(rates: DatedRate[] | undefined, activityId: number, date: string): number {
  if (!rates) return 0;
  const match = rates.find(
    (r) =>
      r.activityId === activityId &&
      r.effectiveFrom <= date &&
      (r.effectiveTo == null || r.effectiveTo >= date)
  );
  return match?.rate || 0;
}
