// Dönem Kilidi — sadece admin. Mutabakat gönderilen aylar kilitlenir;
// kilitli aya hiçbir kanaldan (web + WhatsApp) kayıt girilemez/değiştirilemez.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { MONTHS } from '../lib/format';

interface PeriodLock {
  id: number;
  period: string;
  lockedBy: string | null;
  createdAt: string;
}

function periodLabel(p: string): string {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export default function PeriodLocks() {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmPeriod, setConfirmPeriod] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: locks = [] } = useQuery({
    queryKey: ['locks'],
    queryFn: () => api.get<PeriodLock[]>('/locks'),
  });
  const lockedSet = new Map(locks.map((l) => [l.period, l]));

  const lockMut = useMutation({
    mutationFn: (period: string) => api.post('/locks', { period }),
    onSuccess: (_d, period) => {
      qc.invalidateQueries({ queryKey: ['locks'] });
      toast.show(`🔒 ${periodLabel(period)} kilitlendi`);
      setConfirmPeriod(null);
    },
    onError: (e: any) => toast.show(e.message || 'Kilitlenemedi', 'error'),
  });

  const unlockMut = useMutation({
    mutationFn: (period: string) => api.delete(`/locks/${period}`),
    onSuccess: (_d, period) => {
      qc.invalidateQueries({ queryKey: ['locks'] });
      toast.show(`🔓 ${periodLabel(period)} kilidi açıldı`);
      setConfirmPeriod(null);
    },
    onError: (e: any) => toast.show(e.message || 'Açılamadı', 'error'),
  });

  // Seçili yılın 12 ayı (Ocak → Aralık) — gelecek aylar da kilitlenebilir
  const months: string[] = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`
  );
  const thisPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div className="clabel flex items-center gap-2">
            <Lock size={13} /> Dönem Kilidi
          </div>
          {/* Yıl gezintisi */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="w-8 h-8 rounded-xl bg-white border border-paper-3 shadow-sm flex items-center justify-center text-ink-2 hover:bg-paper-2 transition"
              title="Önceki yıl"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="font-extrabold text-base font-mono w-14 text-center">{year}</span>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="w-8 h-8 rounded-xl bg-white border border-paper-3 shadow-sm flex items-center justify-center text-ink-2 hover:bg-paper-2 transition"
              title="Sonraki yıl"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
        <div className="text-[11.5px] text-ink-3 mb-4">
          Mutabakat gönderdiğin ayı kilitle — kilitli aya kayıt eklenemez, değiştirilemez, silinemez
          (WhatsApp dahil). Gelecek ayları da kilitleyebilirsin. Her işlem audit log'a düşer.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {months.map((p) => {
            const lock = lockedSet.get(p);
            const confirming = confirmPeriod === p;
            return (
              <div
                key={p}
                className={clsx(
                  'border rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 transition',
                  lock ? 'border-brand-amber/40 bg-brand-amber/5' : 'border-paper-3 bg-white',
                  p === thisPeriod && 'ring-2 ring-brand-indigo/20'
                )}
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink truncate">
                    {periodLabel(p)}
                    {p === thisPeriod && <span className="text-[9px] text-brand-indigo font-bold ml-1.5">BU AY</span>}
                  </div>
                  <div className="text-[10px] text-ink-3 truncate">
                    {lock ? `🔒 ${lock.lockedBy || 'kilitli'}` : 'Açık'}
                  </div>
                </div>
                {confirming ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => (lock ? unlockMut.mutate(p) : lockMut.mutate(p))}
                      disabled={lockMut.isPending || unlockMut.isPending}
                      className="text-[10.5px] font-bold px-2 py-1 rounded-lg bg-brand-rose/10 text-brand-rose hover:bg-brand-rose/20"
                    >
                      Eminim
                    </button>
                    <button
                      onClick={() => setConfirmPeriod(null)}
                      className="text-[10.5px] font-semibold px-1.5 py-1 rounded-lg text-ink-3 hover:bg-paper-2"
                    >
                      Vazgeç
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmPeriod(p)}
                    className={clsx(
                      'p-1.5 rounded-lg transition flex-shrink-0',
                      lock
                        ? 'text-brand-amber hover:bg-brand-amber/10'
                        : 'text-ink-3 hover:text-ink hover:bg-paper-2'
                    )}
                    title={lock ? 'Kilidi aç' : 'Kilitle'}
                  >
                    {lock ? <Lock size={15} /> : <LockOpen size={15} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
