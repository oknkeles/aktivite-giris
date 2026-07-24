// Komisyon (iskonto) kuralı — TEK KAYNAK.
//
// Yüklenici iskontosu, işi yaptıran şirketin yükleniciye ödediği komisyondur.
// Kaydı giren kişinin şirketi müşterinin yüklenicisiyle AYNIYSA komisyon uygulanmaz:
// SALDO çalışanı SALDO'nun müşterisinde çalışırken SALDO kendine komisyon ödemez.
// Farklı şirkettense (ör. TDEV'li kişi SALDO müşterisinde) iskonto uygulanır.
export function commissionRate(
  userContractorId: number | null | undefined,
  customerContractorId: number | null | undefined,
  contractorDiscount: number | null | undefined
): number {
  if (userContractorId && customerContractorId && userContractorId === customerContractorId) return 0;
  return contractorDiscount || 0;
}

// Brüt tutardan net (komisyon düşülmüş) tutarı hesaplar.
export function netFromGross(gross: number, discountPct: number): number {
  return gross * (1 - discountPct / 100);
}
