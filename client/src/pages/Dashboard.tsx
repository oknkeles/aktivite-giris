// Dashboard — sadece admin. Seçili ayın müşteri dağılımı, 6 aylık trend, toplam tutar.
// Üstteki ‹ › oklarıyla geçmiş/gelecek aylara gidilebilir.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { CountUp, Skeleton } from '../components/ui';
import { fmtHours, fmtMoney, curSymbol, fmtMoneyByCurrency, MONTHS } from '../lib/format';

interface DashboardData {
  period: string;
  month: { hours: number; count: number; byCurrency: Record<string, number> };
  customers: { id: number; name: string; currency: string; hours: number; net: number }[];
  trend: { period: string; hours: number }[];
}

function periodLabel(p: string): string {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function periodLabelShort(p: string): string {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m) - 1].slice(0, 3)} '${y.slice(2)}`;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Dashboard() {
  const [period, setPeriod] = useState(currentPeriod());
  const isCurrent = period === currentPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api.get<DashboardData>(`/reports/dashboard?period=${period}`),
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero şeridi — ayın özeti, koyu zemin */}
      <div
        className="rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden shadow-soft"
        style={{
          background: '#0B1224',
          backgroundImage:
            'radial-gradient(circle at 8% 20%, rgba(37,99,235,.32) 0%, transparent 45%),' +
            'radial-gradient(circle at 95% 110%, rgba(8,145,178,.24) 0%, transparent 50%)',
        }}
      >
        <div className="flex items-end justify-between gap-4 relative z-10">
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[.14em] text-white/40 uppercase mb-1.5">Ay Özeti</div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight">{periodLabel(period)}</div>
            <div className="text-white/65 text-[13px] sm:text-sm mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
              {isLoading ? (
                <Skeleton className="h-4 w-64 !bg-surface/15" />
              ) : data ? (
                <>
                  <span className="text-white font-bold"><CountUp value={data.month.hours} format={fmtHours} /></span> çalışma
                  <span className="text-white/30">·</span>
                  <span className="text-white font-bold"><CountUp value={data.customers.length} /></span> müşteri
                  <span className="text-white/30">·</span>
                  <span className="text-white font-bold"><CountUp value={data.month.count} /></span> kayıt
                  <span className="text-white/30">·</span>
                  <span className="text-brand-sky font-bold">{fmtMoneyByCurrency(data.month.byCurrency)}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!isCurrent && (
              <button onClick={() => setPeriod(currentPeriod())} className="text-[11px] font-semibold text-white/80 bg-surface/10 hover:bg-surface/20 border border-white/15 rounded-lg px-2.5 py-1.5 transition">Bugün</button>
            )}
            <button onClick={() => setPeriod(shiftPeriod(period, -1))} className="w-9 h-9 rounded-xl bg-surface/10 hover:bg-surface/20 border border-white/15 flex items-center justify-center text-white transition" title="Önceki ay"><ChevronLeft size={16} /></button>
            <button onClick={() => setPeriod(shiftPeriod(period, 1))} className="w-9 h-9 rounded-xl bg-surface/10 hover:bg-surface/20 border border-white/15 flex items-center justify-center text-white transition" title="Sonraki ay"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="card space-y-3">
              <Skeleton className="h-4 w-44" />
              {[0, 1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-7 w-full" />)}
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Müşteri bazında saat dağılımı */}
            <div className="card">
              <div className="clabel mb-4 flex items-center gap-2">
                <Clock size={13} /> {periodLabel(data.period)} Müşteri Dağılımı
              </div>
              {data.customers.length === 0 ? (
                <div className="text-center py-8 text-ink-3 text-sm">Bu ayda kayıt yok</div>
              ) : (
                <div className="space-y-2.5">
                  {data.customers.map((c, i) => {
                    const max = data.customers[0].hours || 1;
                    const pct = Math.max((c.hours / max) * 100, 4);
                    return (
                      <div key={c.id} className="flex items-center gap-3">
                        <span className="w-5 text-[11px] font-mono text-ink-3 text-right flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[12px] mb-1 gap-2">
                            <span className="font-semibold text-ink truncate">{c.name}</span>
                            <span className="font-mono text-ink-3 flex-shrink-0">
                              {fmtHours(c.hours)} · <span className="text-ink font-semibold">{fmtMoney(c.net)} {curSymbol(c.currency)}</span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-paper-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
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
    </div>
  );
}

// Aylık saat trendi — el yapımı SVG (kütüphane gerektirmez).
// Tutar gösterilmiyor: müşteriler farklı para biriminde olabilir, toplamı karışır.
function TrendChart({ trend }: { trend: { period: string; hours: number }[] }) {
  const W = 460;
  const H = 150;
  const padB = 24; // ay etiketi alanı
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
            </g>
          );
        })}
      </svg>
      <div className="text-[10px] text-ink-3 mt-1 text-right">aylık toplam çalışma saati</div>
    </div>
  );
}
