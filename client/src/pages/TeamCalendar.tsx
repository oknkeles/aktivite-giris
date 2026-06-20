// Ekip Takvimi — sadece admin. Aylık ısı haritası: satırlar danışmanlar,
// sütunlar ayın günleri. Her hücre o günün doluluğunu renkle gösterir.
// Danışmanlar seçilebilir (hepsi açık gelir, tiki kaldırılınca filtrelenir).

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Users, Check } from 'lucide-react';
import clsx from 'clsx';
import { api, type Entry, type User } from '../api/client';
import { fmtHours, qtyToHours, MONTHS, DAYS_SHORT } from '../lib/format';
import { getHoliday } from '../lib/holidays';
import Modal from '../components/Modal';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function periodLabel(p: string): string {
  const [y, m] = p.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
// Pazartesi=0 ... Pazar=6
function dowMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export default function TeamCalendar() {
  const [period, setPeriod] = useState(currentPeriod());
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [cell, setCell] = useState<{ user: User; date: string } | null>(null);
  const isCurrent = period === currentPeriod();

  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const from = `${period}-01`;
  const to = `${period}-${String(daysInMonth).padStart(2, '0')}`;

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });
  const { data: entries = [], isFetching } = useQuery({
    queryKey: ['team-entries', from, to],
    queryFn: () => api.get<Entry[]>(`/entries?userId=all&from=${from}&to=${to}`),
  });

  // Kullanıcılar gelince hepsini seçili yap (ilk yüklemede)
  useEffect(() => {
    if (users.length && selected === null) {
      setSelected(new Set(users.map((u) => u.id)));
    }
  }, [users, selected]);

  const sel = selected ?? new Set<number>();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function setAll(on: boolean) {
    setSelected(on ? new Set(users.map((u) => u.id)) : new Set());
  }

  // Günler + meta (hafta sonu / tatil)
  const days = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${period}-${String(i + 1).padStart(2, '0')}`;
      const d = new Date(dateStr + 'T00:00:00');
      const wd = dowMon(d);
      const weekend = wd >= 5;
      const holiday = !!getHoliday(dateStr);
      return { day: i + 1, dateStr, dow: DAYS_SHORT[wd], weekend, holiday, nonwork: weekend || holiday };
    });
  }, [period, daysInMonth]);

  const workdayCount = days.filter((d) => !d.nonwork).length;

  // userId → (date → toplam saat)
  const byUser = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    for (const e of entries) {
      const u = map.get(e.userId) ?? map.set(e.userId, new Map()).get(e.userId)!;
      u.set(e.date, (u.get(e.date) || 0) + qtyToHours(e.qty, e.activity.unit));
    }
    return map;
  }, [entries]);

  const rows = users.filter((u) => sel.has(u.id));

  // Sütun (günlük) toplamları — seçili danışmanlar
  const dayTotals = days.map((d) =>
    rows.reduce((s, u) => s + (byUser.get(u.id)?.get(d.dateStr) || 0), 0)
  );
  const grandTotal = dayTotals.reduce((s, h) => s + h, 0);

  function cellColor(h: number): string {
    if (h <= 0) return '';
    if (h < 8) return 'bg-brand-amber/20 text-[#92400E]';
    if (h <= 8.5) return 'bg-brand-emerald/20 text-brand-emerald';
    return 'bg-brand-indigo/20 text-brand-indigo';
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Üst bar: ay gezintisi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight">{periodLabel(period)}</span>
          {isFetching && <span className="text-[10px] text-ink-3 animate-pulse">yükleniyor…</span>}
          {!isCurrent && (
            <button onClick={() => setPeriod(currentPeriod())} className="btn !py-1 !px-2.5 text-[11px]">Bugün</button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPeriod(shiftPeriod(period, -1))} className="w-9 h-9 rounded-xl bg-surface border border-paper-3 shadow-sm flex items-center justify-center text-ink-2 hover:bg-paper-2 transition" title="Önceki ay"><ChevronLeft size={16} /></button>
          <button onClick={() => setPeriod(shiftPeriod(period, 1))} className="w-9 h-9 rounded-xl bg-surface border border-paper-3 shadow-sm flex items-center justify-center text-ink-2 hover:bg-paper-2 transition" title="Sonraki ay"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Danışman seçimi */}
      <div className="card !p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="clabel flex items-center gap-1.5 mr-1"><Users size={13} /> Danışmanlar</span>
          {users.map((u) => {
            const on = sel.has(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border transition',
                  on
                    ? 'bg-brand-indigo/10 border-brand-indigo/30 text-brand-indigo'
                    : 'bg-surface border-paper-3 text-ink-3 hover:bg-paper-2'
                )}
              >
                <span className={clsx('w-3.5 h-3.5 rounded flex items-center justify-center', on ? 'bg-brand-indigo text-white' : 'border border-paper-3')}>
                  {on && <Check size={10} strokeWidth={3} />}
                </span>
                {u.fullname}
              </button>
            );
          })}
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => setAll(true)} className="text-[11px] font-semibold text-brand-indigo hover:underline">Hepsi</button>
            <span className="text-ink-3">·</span>
            <button onClick={() => setAll(false)} className="text-[11px] font-semibold text-ink-3 hover:underline">Hiçbiri</button>
          </div>
        </div>
      </div>

      {/* Isı haritası */}
      <div className="card !p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-16 text-ink-3 text-sm">Görüntülenecek danışman seç</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-paper-2">
                  <th className="sticky left-0 z-10 bg-paper-2 text-left px-3 py-2 font-extrabold uppercase tracking-wider text-ink-3 min-w-[150px] border-b border-paper-3">
                    Danışman
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.day}
                      className={clsx(
                        'px-0 py-1 text-center font-bold border-b border-l border-paper-3 min-w-[30px]',
                        d.nonwork ? 'bg-paper-3/40 text-ink-3' : 'text-ink-2'
                      )}
                      title={d.holiday ? getHoliday(d.dateStr) || '' : ''}
                    >
                      <div className="leading-none">{d.day}</div>
                      <div className="text-[8px] text-ink-3 font-medium">{d.dow}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-extrabold uppercase tracking-wider text-ink-3 border-b border-l-2 border-paper-3 min-w-[56px]">Top</th>
                  <th className="px-2 py-2 text-center font-extrabold uppercase tracking-wider text-ink-3 border-b border-l border-paper-3 min-w-[56px]">Doluluk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const dayMap = byUser.get(u.id);
                  const totalH = days.reduce((s, d) => s + (dayMap?.get(d.dateStr) || 0), 0);
                  const fillPct = workdayCount > 0 ? Math.round((totalH / (workdayCount * 8)) * 100) : 0;
                  return (
                    <tr key={u.id} className="hover:bg-paper/50">
                      <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 font-semibold text-ink border-b border-paper-3 truncate">
                        {u.fullname}
                      </td>
                      {days.map((d) => {
                        const h = dayMap?.get(d.dateStr) || 0;
                        return (
                          <td
                            key={d.day}
                            onClick={() => h > 0 && setCell({ user: u, date: d.dateStr })}
                            className={clsx(
                              'text-center border-b border-l border-paper-3 font-mono font-semibold tabular-nums',
                              d.nonwork && h <= 0 ? 'bg-paper-3/30' : cellColor(h),
                              h > 0 && 'cursor-pointer hover:ring-2 hover:ring-brand-indigo/40 hover:ring-inset'
                            )}
                            title={h > 0 ? `${u.fullname} · ${d.day} ${MONTHS[Number(period.split('-')[1]) - 1]} · ${h}s — detay için tıkla` : ''}
                          >
                            {h > 0 ? (Number.isInteger(h) ? h : h.toFixed(1)) : ''}
                          </td>
                        );
                      })}
                      <td className="text-center border-b border-l-2 border-paper-3 font-mono font-extrabold text-ink">
                        {fmtHours(totalH)}
                      </td>
                      <td className="border-b border-l border-paper-3 px-1.5">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 h-1.5 rounded-full bg-paper-2 overflow-hidden">
                            <div
                              className={clsx('h-full rounded-full', fillPct >= 90 ? 'bg-brand-emerald' : fillPct >= 50 ? 'bg-brand-amber' : 'bg-brand-rose')}
                              style={{ width: `${Math.min(fillPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-ink-3 w-7 text-right">{fillPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-paper-2 font-bold">
                  <td className="sticky left-0 z-10 bg-paper-2 px-3 py-1.5 text-ink-2 uppercase text-[10px] tracking-wider border-t border-paper-3">Günlük Toplam</td>
                  {days.map((d, i) => (
                    <td key={d.day} className={clsx('text-center border-t border-l border-paper-3 font-mono text-ink-2', d.nonwork && 'bg-paper-3/40')}>
                      {dayTotals[i] > 0 ? Math.round(dayTotals[i]) : ''}
                    </td>
                  ))}
                  <td className="text-center border-t border-l-2 border-paper-3 font-mono text-ink font-extrabold">{fmtHours(grandTotal)}</td>
                  <td className="border-t border-l border-paper-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Hücre detayı — o gün o danışmanın kayıtları */}
      {cell && (() => {
        const dayEntries = entries
          .filter((e) => e.userId === cell.user.id && e.date === cell.date)
          .sort((a, b) => a.id - b.id);
        const d = new Date(cell.date + 'T00:00:00');
        const total = dayEntries.reduce((s, e) => s + qtyToHours(e.qty, e.activity.unit), 0);
        return (
          <Modal
            open
            onClose={() => setCell(null)}
            size="md"
            title={
              <span>
                {cell.user.fullname}
                <span className="text-ink-3 font-normal"> · {d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</span>
              </span>
            }
          >
            {dayEntries.length === 0 ? (
              <div className="text-center py-8 text-ink-3 text-sm">Bu güne kayıt yok</div>
            ) : (
              <div className="space-y-2">
                {dayEntries.map((e) => (
                  <div key={e.id} className="border border-paper-3 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="font-semibold text-sm truncate">{e.customer.name}</div>
                      <span className="tag flex-shrink-0">{e.activity.name}</span>
                      <span className="font-mono font-bold text-brand-indigo flex-shrink-0">
                        {fmtHours(qtyToHours(e.qty, e.activity.unit))}
                      </span>
                    </div>
                    {e.ticketId && <div className="text-[11px] font-mono text-ink-3 mb-0.5">{e.ticketId}</div>}
                    {e.note && <div className="text-[12px] text-ink-2">{e.note}</div>}
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t border-paper-3 text-sm">
                  <span className="text-ink-3 font-semibold">{dayEntries.length} kayıt</span>
                  <span className="font-mono font-extrabold">{fmtHours(total)}</span>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}
    </div>
  );
}
