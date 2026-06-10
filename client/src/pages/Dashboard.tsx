// Dashboard — sadece admin. Bu ayın müşteri dağılımı, 6 aylık trend,
// toplam tutar ve dönem kilidi yönetimi.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, TrendingUp, Clock, Banknote, ListChecks } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { fmtHours, fmtMoney, MONTHS } from '../lib/format';

interface DashboardData {
  period: string;
  month: { hours: number; net: number; count: number };
  customers: { id: number; name: string; hours: number; net: number }[];
  trend: { period: string; hours: number; net: number }[];
}

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

function periodLabelShort(p: string): string {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m) - 1].slice(0, 3)} '${y.slice(2)}`;
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/reports/dashboard'),
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {isLoading && (
        <div className="card text-center py-12 text-ink-3 text-sm">Yükleniyor...</div>
      )}

      {data && (
        <>
          {/* Bu ay özet kartları */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              icon={<Clock size={15} />}
              label={`${periodLabel(data.period)} · Saat`}
              value={fmtHours(data.month.hours)}
            />
            <MetricCard
              icon={<ListChecks size={15} />}
              label="Kayıt Sayısı"
              value={String(data.month.count)}
            />
            <MetricCard
              icon={<Banknote size={15} />}
              label="Faturalanacak Tutar"
              value={`${fmtMoney(data.month.net)} ₺`}
              accent
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Müşteri bazında saat dağılımı */}
            <div className="card">
              <div className="clabel mb-4 flex items-center gap-2">
                <Clock size={13} /> Bu Ay Müşteri Dağılımı
              </div>
              {data.customers.length === 0 ? (
                <div className="text-center py-8 text-ink-3 text-sm">Bu ay henüz kayıt yok</div>
              ) : (
                <div className="space-y-3">
                  {data.customers.map((c) => {
                    const max = data.customers[0].hours || 1;
                    const pct = Math.max((c.hours / max) * 100, 4);
                    return (
                      <div key={c.id}>
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="font-semibold text-ink">{c.name}</span>
                          <span className="font-mono text-ink-2">
                            {fmtHours(c.hours)} · {fmtMoney(c.net)} ₺
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-paper-2 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 6 aylık trend */}
            <div className="card">
              <div className="clabel mb-4 flex items-center gap-2">
                <TrendingUp size={13} /> Son 6 Ay Trendi
              </div>
              <TrendChart trend={data.trend} />
            </div>
          </div>
        </>
      )}

      <PeriodLockPanel />
    </div>
  );
}

function MetricCard({ icon, label, value, accent = false }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card !p-4">
      <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className={clsx('text-2xl font-extrabold font-mono', accent ? 'grad-text-mint' : 'text-ink')}>
        {value}
      </div>
    </div>
  );
}

// Saat = bar, tutar = bar altı etiket. El yapımı SVG — kütüphane gerektirmez.
function TrendChart({ trend }: { trend: { period: string; hours: number; net: number }[] }) {
  const W = 460;
  const H = 170;
  const padB = 38; // ay + tutar etiketi alanı
  const padT = 18;
  const maxH = Math.max(...trend.map((t) => t.hours), 1);
  const barW = 38;
  const step = W / trend.length;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 360 }}>
        {trend.map((t, i) => {
          const h = ((H - padB - padT) * t.hours) / maxH;
          const x = i * step + (step - barW) / 2;
          const y = H - padB - h;
          const isLast = i === trend.length - 1;
          return (
            <g key={t.period}>
              {/* Saat barı */}
              <rect
                x={x} y={y} width={barW} height={Math.max(h, 2)} rx={5}
                className={isLast ? 'fill-brand-indigo' : 'fill-brand-indigo/35'}
              />
              {/* Saat etiketi (bar üstü) */}
              <text
                x={x + barW / 2} y={y - 5} textAnchor="middle"
                className="fill-ink-2 font-mono" fontSize={10} fontWeight={700}
              >
                {t.hours > 0 ? `${Math.round(t.hours)}s` : ''}
              </text>
              {/* Ay adı */}
              <text
                x={x + barW / 2} y={H - padB + 14} textAnchor="middle"
                className="fill-ink-3" fontSize={10} fontWeight={600}
              >
                {periodLabelShort(t.period)}
              </text>
              {/* Tutar */}
              <text
                x={x + barW / 2} y={H - padB + 28} textAnchor="middle"
                className="fill-ink-3 font-mono" fontSize={9}
              >
                {t.net > 0 ? `${Math.round(t.net / 1000)}K` : '—'}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="text-[10px] text-ink-3 mt-1 text-right">bar = saat · alt satır = tutar (bin ₺)</div>
    </div>
  );
}

// ── Dönem Kilidi paneli ───────────────────────────────────
function PeriodLockPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmPeriod, setConfirmPeriod] = useState<string | null>(null);

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

  // Son 12 ay (bu ay dahil, yeni → eski)
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="card">
      <div className="clabel mb-1 flex items-center gap-2">
        <Lock size={13} /> Dönem Kilidi
      </div>
      <div className="text-[11.5px] text-ink-3 mb-4">
        Mutabakat gönderdiğin ayı kilitle — kilitli aya kayıt eklenemez, değiştirilemez, silinemez
        (WhatsApp dahil). Gerekirse buradan tekrar açabilirsin; her işlem audit log'a düşer.
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
                lock ? 'border-brand-amber/40 bg-brand-amber/5' : 'border-paper-3 bg-white'
              )}
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-ink truncate">{periodLabel(p)}</div>
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
  );
}
