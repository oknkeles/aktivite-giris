import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckSquare, Plus, Sparkles, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { api, type Entry, type Customer, type Activity } from '../api/client';
import { useAuth } from '../store/auth';
import { useToast, confettiBurst } from '../components/Toast';
import Modal from '../components/Modal';
import { MONTHS, DAYS_SHORT, DAYS_LONG, dateStr, qtyToHours, fmtHours } from '../lib/format';

function entryHours(e: Entry): number {
  return qtyToHours(e.qty, e.activity.unit);
}

export default function Timesheet() {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [multiMode, setMultiMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<Set<string>>(new Set());
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  // Fetch month entries
  const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const from = `${monthStr}-01`;
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const { data: entries = [] } = useQuery({
    queryKey: ['entries', from, to],
    queryFn: () => api.get<Entry[]>(`/entries?from=${from}&to=${to}`),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
  });

  // Build cells
  const cells = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    let startDow = first.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();
    const arr: { day: number; cur: boolean; date: string | null }[] = [];
    for (let i = startDow - 1; i >= 0; i--) arr.push({ day: daysInPrev - i, cur: false, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push({ day: d, cur: true, date: `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    while (arr.length % 7 !== 0) arr.push({ day: arr.length - startDow - daysInMonth + 1, cur: false, date: null });
    return arr;
  }, [calYear, calMonth]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    entries.forEach((e) => { (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [entries]);

  // Month metrics — sadece saat ve gün (tutar bilgisi yok, Raporlar sayfasına bakın)
  const monthHours = entries.reduce((s, e) => s + entryHours(e), 0);
  const activeDays = new Set(entries.map((e) => e.date)).size;
  const avgPerDay = activeDays > 0 ? monthHours / activeDays : 0;

  const goPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
  const goNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };
  const goToday = () => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); };

  function clearAll() { setSelected(new Set()); setMultiMode(false); }
  function toggleMulti() {
    setMultiMode((m) => !m);
    if (multiMode) setSelected(new Set());
  }

  // Drag handlers
  function onCellMouseDown(e: React.MouseEvent, date: string) {
    if (e.button !== 0) return;
    setDragAnchor(date);
    setDragPreview(new Set([date]));
    if (multiMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(date)) next.delete(date); else next.add(date);
        return next;
      });
    }
    e.preventDefault();
  }

  function onCellMouseEnter(date: string) {
    if (!dragAnchor) return;
    // build range
    const [a, b] = [dragAnchor, date].sort();
    const range = new Set<string>();
    const cur = new Date(a + 'T00:00:00');
    const stop = new Date(b + 'T00:00:00');
    while (cur <= stop) {
      range.add(dateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    setDragPreview(range);
  }

  useEffect(() => {
    function onUp() {
      if (!dragAnchor) return;
      if (dragPreview.size > 1) {
        setSelected((prev) => new Set([...prev, ...dragPreview]));
        setMultiMode(true);
      } else if (dragPreview.size === 1 && !multiMode) {
        setActiveDate(dragAnchor);
      }
      setDragAnchor(null);
      setDragPreview(new Set());
    }
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [dragAnchor, dragPreview, multiMode]);

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] 2xl:grid-cols-[1fr_380px] gap-5 animate-fade-in">
      {/* LEFT: Calendar */}
      <div className="min-w-0">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5 px-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex-1 min-w-[180px]">
            {MONTHS[calMonth]}
            <span className="grad-text font-bold ml-2.5">{calYear}</span>
          </h1>
          <button
            className={clsx(
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 text-xs font-bold transition shadow-soft',
              multiMode
                ? 'bg-grad-primary text-white border-transparent shadow-glow'
                : 'bg-white border-paper-3 text-ink hover:bg-brand-violet/10 hover:border-brand-violet hover:text-brand-violet'
            )}
            onClick={toggleMulti}
          >
            <CheckSquare size={13} />
            Çoklu Seçim
          </button>
          <button className="px-4 py-2 rounded-full border-2 border-paper-3 bg-white text-xs font-bold hover:bg-brand-indigo/10 hover:border-brand-indigo hover:text-brand-indigo transition shadow-soft" onClick={goToday}>
            Bugün
          </button>
          <button className="w-9 h-9 rounded-full bg-white border-2 border-paper-3 flex items-center justify-center hover:bg-grad-primary hover:text-white hover:border-transparent shadow-soft transition" onClick={goPrev}>
            <ChevronLeft size={16} />
          </button>
          <button className="w-9 h-9 rounded-full bg-white border-2 border-paper-3 flex items-center justify-center hover:bg-grad-primary hover:text-white hover:border-transparent shadow-soft transition" onClick={goNext}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Summary metrics — saat odaklı, tutar bilgisi Raporlar sayfasında */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <MetricCard label="⏱️ Bu Ay" value={fmtHours(monthHours)} variant="indigo" />
          <MetricCard label="📅 Aktif Gün" value={activeDays.toString()} variant="neutral" />
          <MetricCard label="📊 Gün Ort." value={fmtHours(avgPerDay)} variant="emerald" />
        </div>

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3.5 rounded-2xl bg-grad-primary text-white shadow-glow animate-fade-in flex-wrap">
            <Sparkles size={18} />
            <div className="font-bold text-sm flex-1 flex items-center gap-2">
              <span className="bg-white/25 px-2.5 py-0.5 rounded-xl font-mono">{selected.size}</span>
              gün seçildi · toplu giriş yapabilirsin
            </div>
            <button className="bg-white/20 border border-white/25 rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-white/30 transition" onClick={clearAll}>
              Temizle
            </button>
            <button className="bg-white text-brand-indigo rounded-lg px-3.5 py-1.5 text-xs font-bold hover:shadow-lg transition" onClick={() => setBulkOpen(true)}>
              ✨ Toplu Ekle
            </button>
          </div>
        )}

        {/* Hint */}
        <div className="text-xs text-ink-3 mb-3 px-1">
          💡 Tek tıkla gün modalını aç · sürükleyerek birden fazla gün seç · "Çoklu Seçim" ile tek tek seç
        </div>

        {/* Calendar */}
        <div className="border border-paper-3 rounded-2xl overflow-hidden shadow-md bg-paper-3">
          <div className="grid grid-cols-7 gap-px bg-paper-3">
            {DAYS_SHORT.map((d, i) => (
              <div key={d} className={clsx(
                'bg-white text-center text-[10px] sm:text-[11px] font-extrabold py-3 uppercase tracking-widest',
                i >= 5 ? 'text-brand-pink' : 'text-ink-3'
              )}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-paper-3 select-none">
            {cells.map((c, idx) => {
              const dayEntries = c.date ? (entriesByDate[c.date] || []) : [];
              const totalHours = dayEntries.reduce((s, e) => s + entryHours(e), 0);
              const isToday = c.date === dateStr(today);
              const isSelected = c.date && selected.has(c.date);
              const isDragPrev = c.date && dragPreview.has(c.date);
              const isWeekend = idx % 7 >= 5;
              const pct = Math.min((totalHours / 8) * 100, 100);

              return (
                <div
                  key={idx}
                  className={clsx(
                    'relative bg-white min-h-[110px] sm:min-h-[130px] p-2 sm:p-2.5 pb-7 transition-colors overflow-hidden flex flex-col',
                    c.cur ? 'cursor-pointer' : 'bg-paper cursor-default',
                    !c.cur && 'opacity-50',
                    c.cur && !isSelected && 'hover:bg-brand-violet/10',
                    c.cur && isWeekend && !isSelected && 'bg-[#FEFAFC]',
                    isSelected && 'bg-gradient-to-br from-brand-indigo/15 to-brand-pink/10 ring-2 ring-brand-indigo ring-inset z-[2]',
                    isDragPrev && !isSelected && 'bg-gradient-to-br from-brand-indigo/15 to-brand-pink/10 ring-2 ring-brand-violet ring-inset'
                  )}
                  onMouseDown={(e) => c.date && onCellMouseDown(e, c.date)}
                  onMouseEnter={() => c.date && onCellMouseEnter(c.date)}
                >
                  <div className={clsx(
                    'inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 text-[13px] sm:text-[14px] font-semibold transition-transform',
                    isToday && 'bg-grad-primary text-white rounded-full font-extrabold shadow-glow',
                    !isToday && !c.cur && 'text-ink-4',
                    !isToday && c.cur && 'text-ink',
                  )}>
                    {c.day}
                  </div>

                  {/* Chips (max 2) */}
                  <div className="flex-1 min-h-0 mt-1 space-y-1">
                    {dayEntries.slice(0, 2).map((e, i) => {
                      const colorIdx = (e.customerId || 0) % 5;
                      const gradients = [
                        'from-brand-indigo to-brand-violet',
                        'from-brand-emerald to-brand-cyan',
                        'from-brand-amber to-brand-pink',
                        'from-brand-sky to-brand-indigo',
                        'from-brand-violet to-brand-pink',
                      ];
                      return (
                        <div key={e.id} className={clsx(
                          'flex items-center gap-1 text-[10px] sm:text-[11px] text-white font-semibold rounded-lg px-1.5 pl-2 py-0.5 shadow-sm',
                          'bg-gradient-to-r', gradients[colorIdx]
                        )}>
                          <span className="flex-1 truncate">{e.customer.name.split(' ')[0]}</span>
                          <span className="bg-white/30 rounded text-[9px] font-mono font-extrabold px-1 py-px flex-shrink-0">
                            {fmtHours(entryHours(e))}
                          </span>
                        </div>
                      );
                    })}
                    {dayEntries.length > 2 && (
                      <div className="text-[9.5px] font-bold text-brand-violet pl-1">
                        +{dayEntries.length - 2} daha
                      </div>
                    )}
                  </div>

                  {/* Total footer — sadece saat */}
                  {totalHours > 0 && (
                    <div className="absolute bottom-2 right-2 flex justify-end items-baseline text-[10px] font-mono font-extrabold text-ink-3">
                      {fmtHours(totalHours)}
                    </div>
                  )}

                  {/* Fill bar */}
                  {totalHours > 0 && (
                    <div
                      className={clsx(
                        'absolute left-0 bottom-0 h-[3px] transition-all',
                        pct >= 100 ? 'bg-grad-warm shadow-[0_-2px_18px_rgba(37,99,235,.4)]' : 'bg-grad-primary'
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: Side panel (visible on xl+) */}
      <SidePanel
        entries={entries}
        onAddToday={() => setActiveDate(dateStr(today))}
      />

      {/* Day Modal */}
      {activeDate && (
        <DayModal
          date={activeDate}
          onClose={() => setActiveDate(null)}
          entries={entriesByDate[activeDate] || []}
          customers={customers}
          activities={activities}
        />
      )}

      {/* Bulk Modal */}
      {bulkOpen && (
        <BulkModal
          dates={[...selected].sort()}
          onClose={() => setBulkOpen(false)}
          customers={customers}
          activities={activities}
          onDone={() => { clearAll(); setBulkOpen(false); }}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, variant }: { label: string; value: string; variant: 'indigo' | 'emerald' | 'neutral' }) {
  return (
    <div className="bg-white border border-paper-3 rounded-2xl p-4 sm:p-5 shadow-soft hover:-translate-y-1 hover:shadow-md transition-all relative overflow-hidden">
      <div className={clsx(
        'absolute top-0 left-0 right-0 h-1',
        variant === 'indigo' && 'bg-grad-primary',
        variant === 'emerald' && 'bg-grad-mint',
        variant === 'neutral' && 'bg-paper-3'
      )} />
      <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider mb-2">{label}</div>
      <div className={clsx(
        'text-2xl sm:text-3xl font-extrabold font-mono tracking-tight',
        variant === 'indigo' && 'grad-text',
        variant === 'emerald' && 'grad-text-mint',
        variant === 'neutral' && 'text-ink'
      )}>{value}</div>
    </div>
  );
}

function SidePanel({ entries, onAddToday }: { entries: Entry[]; onAddToday: () => void }) {
  // Top customers this month by hours (NO amount info)
  const byCustomer = useMemo(() => {
    const map: Record<string, { name: string; hours: number; count: number }> = {};
    entries.forEach((e) => {
      const k = e.customer.name;
      if (!map[k]) map[k] = { name: k, hours: 0, count: 0 };
      map[k].hours += entryHours(e);
      map[k].count += 1;
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours).slice(0, 8);
  }, [entries]);

  // Top activity types by hours
  const byActivity = useMemo(() => {
    const map: Record<string, { name: string; hours: number }> = {};
    entries.forEach((e) => {
      const k = e.activity.name;
      if (!map[k]) map[k] = { name: k, hours: 0 };
      map[k].hours += entryHours(e);
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours);
  }, [entries]);

  // Recent 6 entries (no amounts)
  const recent = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [entries]);

  return (
    <aside className="hidden xl:flex flex-col gap-4 min-w-0">
      <button
        onClick={onAddToday}
        className="bg-grad-primary text-white rounded-2xl p-4 font-bold flex items-center justify-center gap-2 shadow-glow hover:shadow-[0_12px_30px_rgba(37,99,235,.45)] hover:-translate-y-0.5 transition-all"
        style={{ backgroundSize: '200% 200%' }}
      >
        <Plus size={18} /> Bugüne Hızlı Kayıt
      </button>

      <div className="card">
        <div className="clabel mb-3">🏆 En Çok Çalışılan Müşteriler</div>
        {byCustomer.length === 0 ? (
          <div className="text-xs text-ink-3 py-4 text-center">Henüz kayıt yok</div>
        ) : (
          <div className="space-y-2">
            {byCustomer.map((c) => {
              const max = byCustomer[0].hours || 1;
              const pct = (c.hours / max) * 100;
              return (
                <div key={c.name} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold truncate">{c.name}</span>
                    <span className="font-mono font-bold text-brand-violet">{fmtHours(c.hours)}</span>
                  </div>
                  <div className="h-1.5 bg-paper-2 rounded-full overflow-hidden">
                    <div className="h-full bg-grad-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {byActivity.length > 0 && (
        <div className="card">
          <div className="clabel mb-3">📊 Seviye Dağılımı</div>
          <div className="space-y-2">
            {byActivity.map((a) => {
              const total = byActivity.reduce((s, x) => s + x.hours, 0) || 1;
              const pct = (a.hours / total) * 100;
              return (
                <div key={a.name} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{a.name}</span>
                    <span className="font-mono font-bold text-brand-emerald">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-paper-2 rounded-full overflow-hidden">
                    <div className="h-full bg-grad-mint rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card flex-1 min-h-0 flex flex-col">
        <div className="clabel mb-3">🕒 Son Kayıtlar</div>
        {recent.length === 0 ? (
          <div className="text-xs text-ink-3 py-4 text-center">Henüz kayıt yok</div>
        ) : (
          <div className="space-y-3 overflow-y-auto">
            {recent.map((e) => (
              <div key={e.id} className="flex items-start gap-2 pb-3 border-b border-paper-3 last:border-b-0 last:pb-0">
                <div className="w-10 h-10 rounded-xl bg-grad-primary text-white flex items-center justify-center font-extrabold text-xs flex-shrink-0">
                  {new Date(e.date + 'T00:00:00').getDate()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{e.customer.name}</div>
                  <div className="text-[11px] text-ink-3 truncate">{e.activity.name}</div>
                </div>
                <div className="text-[11px] font-mono font-bold text-brand-violet flex-shrink-0">
                  {fmtHours(entryHours(e))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────
function DayModal({ date, onClose, entries, customers, activities }: {
  date: string;
  onClose: () => void;
  entries: Entry[];
  customers: Customer[];
  activities: Activity[];
}) {
  const d = new Date(date + 'T00:00:00');
  const [cusId, setCusId] = useState<number | ''>('');
  const [actId, setActId] = useState<number | ''>('');
  const [qty, setQty] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [note, setNote] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const addMut = useMutation({
    mutationFn: () => api.post('/entries', { date, qty: parseFloat(qty), customerId: cusId, activityId: actId, ticketId: ticketId || null, note: note || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      setQty(''); setTicketId(''); setNote(''); setCusId(''); setActId('');
      const prevHours = entries.reduce((s, e) => s + entryHours(e), 0);
      const act = activities.find((a) => a.id === actId);
      const newH = prevHours + (act?.unit === 'saat' ? parseFloat(qty) : parseFloat(qty) * 8);
      if (prevHours < 8 && newH >= 8) {
        confettiBurst();
        toast.show('🔥 8 saati tamamladın!');
      } else toast.show(`✓ Kayıt eklendi · ${fmtHours(newH)} bugün`);
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  });

  function save() {
    if (!cusId) return toast.show('Müşteri seçin', 'error');
    if (!actId) return toast.show('Aktivite seçin', 'error');
    if (!qty || parseFloat(qty) <= 0) return toast.show('Geçerli süre girin', 'error');
    addMut.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <span className="grad-text">{DAYS_LONG[d.getDay()]}</span>
          <span className="text-ink-3 font-bold">·</span>
          <span>{d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</span>
        </div>
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>Kapat</button>
          <button className="btn btn-primary" onClick={save}>Kaydet</button>
        </>
      }
    >
      {entries.length > 0 && (
        <div className="mb-5">
          <div className="clabel mb-2.5">Bu Güne Ait Kayıtlar</div>
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 p-3 bg-paper-2 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex flex-wrap items-center gap-1.5">
                    {e.customer.name}
                    <span className="text-ink-3 font-normal">— {e.activity.name}</span>
                    {e.ticketId && (
                      <span className="badge bg-brand-violet/15 text-brand-violet font-mono !text-[10px]">
                        🎫 {e.ticketId}
                      </span>
                    )}
                  </div>
                  {e.note && <div className="text-[11.5px] text-ink-3 mt-1 whitespace-pre-wrap leading-relaxed">{e.note}</div>}
                </div>
                <span className="tag font-bold flex-shrink-0">{fmtHours(entryHours(e))}</span>
                <button onClick={() => delMut.mutate(e.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <hr className="my-5 border-paper-3" />
        </div>
      )}

      <div className="clabel mb-3">Yeni Kayıt Ekle</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Müşteri / Proje</label>
          <select className="input" value={cusId} onChange={(e) => setCusId(e.target.value ? +e.target.value : '')}>
            <option value="">— Seçin —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Aktivite Türü</label>
          <select className="input" value={actId} onChange={(e) => setActId(e.target.value ? +e.target.value : '')}>
            <option value="">— Seçin —</option>
            {activities.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 mb-3">
        <div>
          <label className="label">Süre (Saat)</label>
          <input className="input font-mono" type="number" step="0.25" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            🎫 Talep ID
            <span className="text-[10px] font-normal text-ink-3">(isteğe bağlı)</span>
          </label>
          <input
            className="input font-mono"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="ör. JIRA-1234, ZBT-5678, TICKET-9012..."
          />
        </div>
      </div>
      <div className="mb-2">
        <label className="label flex items-center gap-1.5">
          📝 Açıklama / Talep Detayı
          <span className="text-[10px] font-normal text-ink-3">(isteğe bağlı)</span>
        </label>
        <textarea
          className="input min-h-[120px] resize-y leading-relaxed"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Proje modülü, yapılan iş, çözülen problem, talep detayları..."
          rows={5}
        />
        <div className="text-[10.5px] text-ink-3 mt-1.5 text-right">{note.length} karakter</div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────
function BulkModal({ dates, onClose, customers, activities, onDone }: {
  dates: string[];
  onClose: () => void;
  customers: Customer[];
  activities: Activity[];
  onDone: () => void;
}) {
  const [cusId, setCusId] = useState<number | ''>('');
  const [actId, setActId] = useState<number | ''>('');
  const [qty, setQty] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [note, setNote] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const bulkMut = useMutation({
    mutationFn: () => api.post('/entries/bulk', {
      dates,
      qty: parseFloat(qty),
      customerId: cusId,
      activityId: actId,
      ticketId: ticketId || null,
      note: note || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      confettiBurst();
      toast.show(`🎉 ${dates.length} güne aktivite kaydedildi!`);
      onDone();
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  function save() {
    if (!cusId) return toast.show('Müşteri seçin', 'error');
    if (!actId) return toast.show('Aktivite seçin', 'error');
    if (!qty || parseFloat(qty) <= 0) return toast.show('Geçerli süre girin', 'error');
    bulkMut.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<span className="grad-text">✨ Toplu Aktivite Girişi</span>}
      footer={
        <>
          <button className="btn" onClick={onClose}>İptal</button>
          <button className="btn btn-primary" onClick={save}>🚀 Hepsine Ekle</button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5 mb-4 max-h-32 overflow-y-auto">
        {dates.map((d) => {
          const dt = new Date(d + 'T00:00:00');
          return (
            <span key={d} className="bg-grad-primary text-white text-[11px] px-2.5 py-1 rounded-full font-bold">
              {DAYS_SHORT[(dt.getDay() + 6) % 7]} {dt.getDate()} {MONTHS[dt.getMonth()].substring(0, 3)}
            </span>
          );
        })}
      </div>
      <div className="text-xs text-ink-3 mb-4 pb-3 border-b border-paper-3">
        📅 <strong>{dates.length}</strong> gün seçildi · Her güne aynı kayıt eklenecek
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Müşteri / Proje</label>
          <select className="input" value={cusId} onChange={(e) => setCusId(e.target.value ? +e.target.value : '')}>
            <option value="">— Seçin —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Aktivite Türü</label>
          <select className="input" value={actId} onChange={(e) => setActId(e.target.value ? +e.target.value : '')}>
            <option value="">— Seçin —</option>
            {activities.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 mb-3">
        <div>
          <label className="label">Günlük Süre (Saat)</label>
          <input className="input font-mono" type="number" step="0.25" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="8" />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            🎫 Talep ID
            <span className="text-[10px] font-normal text-ink-3">(isteğe bağlı · tüm günlere aynı uygulanır)</span>
          </label>
          <input
            className="input font-mono"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            placeholder="ör. JIRA-1234"
          />
        </div>
      </div>
      <div>
        <label className="label flex items-center gap-1.5">
          📝 Açıklama / Talep Detayı
          <span className="text-[10px] font-normal text-ink-3">(isteğe bağlı)</span>
        </label>
        <textarea
          className="input min-h-[120px] resize-y leading-relaxed"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Proje modülü, yapılan iş, çözülen problem, talep detayları..."
          rows={5}
        />
        <div className="text-[10.5px] text-ink-3 mt-1.5 text-right">{note.length} karakter</div>
      </div>
    </Modal>
  );
}
