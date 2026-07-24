// Görünürlük kapsamı — TEK KAYNAK.
//
// admin/PY tüm veriyi değil, YALNIZCA sorumlu olduğu yüklenicilere ait
// müşterilerin kayıtlarını görür. Örn. SALDO sorumlusu, TDEV müşterisi olan
// TFS'in kayıtlarını göremez — kayıt aynı kişiye ait olsa bile.
//
// DİKKAT: kapsam KOMİSYONU ETKİLEMEZ. Komisyon User.contractorId
// (çalıştığı şirket) ile hesaplanır — bkz. services/commission.ts
import { prisma } from '../db.js';

// Kullanıcının görebileceği yüklenici id'leri.
// Öncelik: açık kapsam kayıtları → yoksa çalıştığı şirket → o da yoksa boş (hiçbir şey).
export async function scopeContractorIds(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { contractorId: true, scopes: { select: { contractorId: true } } },
  });
  if (!user) return [];
  if (user.scopes.length) return user.scopes.map((s) => s.contractorId);
  return user.contractorId ? [user.contractorId] : [];
}

// Entry sorgusuna kapsam filtresini ekler (mevcut customer filtresini bozmadan).
export function applyScopeToEntryWhere(where: any, scopeIds: number[]) {
  const scopeFilter = { contractorId: { in: scopeIds } };
  where.customer = where.customer ? { AND: [where.customer, scopeFilter] } : scopeFilter;
  return where;
}
