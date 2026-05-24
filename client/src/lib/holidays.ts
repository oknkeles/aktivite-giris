// TR resmi tatil takvimi — Timesheet'te subtle renklendirme için.
// Dini bayramlar yıllık güncellenir.

const TR_HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': 'Yılbaşı',
  '2025-03-30': 'Ramazan Bayramı 1.',
  '2025-03-31': 'Ramazan Bayramı 2.',
  '2025-04-01': 'Ramazan Bayramı 3.',
  '2025-04-23': 'Ulusal Egemenlik',
  '2025-05-01': 'İşçi Bayramı',
  '2025-05-19': "Atatürk'ü Anma",
  '2025-06-06': 'Kurban Bayramı 1.',
  '2025-06-07': 'Kurban Bayramı 2.',
  '2025-06-08': 'Kurban Bayramı 3.',
  '2025-06-09': 'Kurban Bayramı 4.',
  '2025-07-15': 'Demokrasi ve Milli Birlik',
  '2025-08-30': 'Zafer Bayramı',
  '2025-10-29': 'Cumhuriyet Bayramı',

  // 2026
  '2026-01-01': 'Yılbaşı',
  '2026-03-20': 'Ramazan Bayramı 1.',
  '2026-03-21': 'Ramazan Bayramı 2.',
  '2026-03-22': 'Ramazan Bayramı 3.',
  '2026-04-23': 'Ulusal Egemenlik',
  '2026-05-01': 'İşçi Bayramı',
  '2026-05-19': "Atatürk'ü Anma",
  '2026-05-27': 'Kurban Bayramı 1.',
  '2026-05-28': 'Kurban Bayramı 2.',
  '2026-05-29': 'Kurban Bayramı 3.',
  '2026-05-30': 'Kurban Bayramı 4.',
  '2026-07-15': 'Demokrasi ve Milli Birlik',
  '2026-08-30': 'Zafer Bayramı',
  '2026-10-29': 'Cumhuriyet Bayramı',

  // 2027
  '2027-01-01': 'Yılbaşı',
  '2027-04-23': 'Ulusal Egemenlik',
  '2027-05-01': 'İşçi Bayramı',
  '2027-05-19': "Atatürk'ü Anma",
  '2027-07-15': 'Demokrasi ve Milli Birlik',
  '2027-08-30': 'Zafer Bayramı',
  '2027-10-29': 'Cumhuriyet Bayramı',
};

export function getHoliday(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return TR_HOLIDAYS[dateStr] || null;
}

export function isHoliday(dateStr: string | null): boolean {
  return getHoliday(dateStr) !== null;
}
