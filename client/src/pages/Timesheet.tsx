import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckSquare, Sparkles, Trash2, Pencil, Zap, Wand2, Plus, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { api, type Entry, type Customer, type Activity } from '../api/client';
import { useAuth } from '../store/auth';
import { useHeader } from '../store/header';
import { useQuickEntry } from '../store/quickEntry';
import { useToast, confettiBurst } from '../components/Toast';
import Modal from '../components/Modal';
import { MONTHS, DAYS_SHORT, DAYS_LONG, dateStr, qtyToHours, fmtHours } from '../lib/format';
import { getHoliday } from '../lib/holidays';

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
  const totalDays = monthHours / 8;

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

  // Layout topbar'a ay/yıl + nav butonlarını inject et
  const setExtras = useHeader((s) => s.setExtras);
  useEffect(() => {
    setExtras(
      <>
        <span className="text-ink-4 font-normal hidden sm:inline">·</span>
        <span className="text-sm sm:text-base font-bold tracking-tight">
          {MONTHS[calMonth]} <span className="text-ink-4 font-medium">{calYear}</span>
        </span>
        <div className="flex-1" />
        <button
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition',
            multiMode
              ? 'bg-brand-indigo text-white'
              : 'bg-paper-2 text-ink-2 hover:bg-paper-3'
          )}
          onClick={toggleMulti}
        >
          <CheckSquare size={13} />
          <span className="hidden sm:inline">Çoklu Seçim</span>
        </button>
        <button className="px-2.5 py-1.5 rounded-lg bg-paper-2 text-ink-2 text-xs font-semibold hover:bg-paper-3 transition" onClick={goToday}>
          Bugün
        </button>
        <button className="w-8 h-8 rounded-lg bg-paper-2 text-ink-2 flex items-center justify-center hover:bg-paper-3 transition" onClick={goPrev}>
          <ChevronLeft size={15} />
        </button>
        <button className="w-8 h-8 rounded-lg bg-paper-2 text-ink-2 flex items-center justify-center hover:bg-paper-3 transition" onClick={goNext}>
          <ChevronRight size={15} />
        </button>
      </>
    );
    return () => setExtras(null);
  }, [calMonth, calYear, multiMode, setExtras]);

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-112px)]">
      <div className="min-w-0 flex-1 flex flex-col min-h-0">
        {/* Summary metrics + last entry — kompakt */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
          <MetricCard label="Bu Ay" value={fmtHours(monthHours)} variant="indigo" />
          <MetricCard label="Aktif Gün" value={activeDays.toString()} variant="neutral" />
          <MetricCard label="Toplam Gün" value={totalDays.toFixed(1)} variant="emerald" />
          <LastEntryCard entries={entries} />
        </div>

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-xl bg-brand-indigo text-white animate-fade-in flex-wrap">
            <Sparkles size={15} />
            <div className="text-sm flex-1 flex items-center gap-2">
              <span className="bg-surface/20 px-2 py-0.5 rounded font-mono font-bold text-xs">{selected.size}</span>
              <span className="font-medium">gün seçildi</span>
            </div>
            <button className="bg-surface/15 rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-surface/25 transition" onClick={clearAll}>
              Temizle
            </button>
            <button className="bg-surface text-brand-indigo rounded-md px-3 py-1 text-xs font-bold hover:bg-paper-2 transition" onClick={() => setBulkOpen(true)}>
              Toplu Ekle
            </button>
          </div>
        )}

        {/* Aksiyon butonları + ipucu — hint metninin yerine */}
        <TimesheetActions />



        {/* Calendar — macOS Calendar style clean grid, viewport'a göre esner */}
        <div className="rounded-xl bg-surface border border-paper-3 overflow-hidden flex-1 flex flex-col min-h-0">
          {/* Day headers — hafta sonu renkli */}
          <div className="grid grid-cols-7 border-b border-paper-3 flex-shrink-0">
            {DAYS_SHORT.map((d, i) => (
              <div
                key={d}
                className={clsx(
                  'text-center text-[10px] font-semibold py-2 uppercase tracking-[0.14em]',
                  i >= 5 ? 'text-brand-rose/70' : 'text-ink-3'
                )}
              >
                {d}
              </div>
            ))}
          </div>
          {/* Grid cells — N hafta, eşit yükseklikte, kalan alanı doldurur */}
          <div
            className="grid grid-cols-7 select-none flex-1 min-h-0"
            style={{ gridTemplateRows: `repeat(${cells.length / 7}, minmax(0, 1fr))` }}
          >
            {cells.map((c, idx) => {
              const dayEntries = c.date ? (entriesByDate[c.date] || []) : [];
              const totalHours = dayEntries.reduce((s, e) => s + entryHours(e), 0);
              const isToday = c.date === dateStr(today);
              const isSelected = c.date && selected.has(c.date);
              const isDragPrev = c.date && dragPreview.has(c.date);
              const isLastCol = idx % 7 === 6;
              const isLastRow = idx >= cells.length - 7;
              const isWeekend = c.cur && (idx % 7 === 5 || idx % 7 === 6);
              const holidayName = c.cur ? getHoliday(c.date) : null;
              const isHoliday = !!holidayName;

              return (
                <div
                  key={idx}
                  title={holidayName || undefined}
                  className={clsx(
                    'relative min-h-[88px] px-1.5 py-1.5 transition-colors overflow-hidden flex flex-col',
                    !isLastCol && 'border-r border-paper-2',
                    !isLastRow && 'border-b border-paper-2',
                    c.cur ? 'cursor-pointer' : 'bg-paper-2/40 cursor-default',
                    !c.cur && 'opacity-60',
                    // Arka plan öncelik sırası: seçili > drag > tatil > hafta sonu > normal
                    c.cur && !isSelected && !isDragPrev && !isHoliday && !isWeekend && 'bg-surface hover:bg-paper-2/60',
                    c.cur && !isSelected && !isDragPrev && isWeekend && !isHoliday && 'bg-paper-2/40 hover:bg-paper-2/70',
                    c.cur && !isSelected && !isDragPrev && isHoliday && 'bg-brand-amber/[0.07] hover:bg-brand-amber/[0.12]',
                    isSelected && 'bg-brand-indigo/10 ring-1 ring-brand-indigo/40 ring-inset z-[2]',
                    isDragPrev && !isSelected && 'bg-brand-indigo/8'
                  )}
                  onMouseDown={(e) => c.date && onCellMouseDown(e, c.date)}
                  onMouseEnter={() => c.date && onCellMouseEnter(c.date)}
                >
                  {/* Day number + tatil etiketi — top, sağa hizalı */}
                  <div className="flex items-center justify-between mb-1 h-[22px] gap-1 min-w-0">
                    {/* Tatil adı — sol, küçük italik */}
                    {isHoliday && (
                      <span className="text-[9.5px] text-brand-amber font-semibold truncate" title={holidayName!}>
                        {holidayName!.length > 14 ? holidayName!.substring(0, 12) + '…' : holidayName}
                      </span>
                    )}
                    <div className={clsx(
                      'inline-flex items-center justify-center min-w-[22px] h-[22px] text-[12.5px] font-semibold leading-none ml-auto flex-shrink-0',
                      isToday && 'bg-brand-indigo text-white rounded-full px-1.5',
                      !isToday && !c.cur && 'text-ink-4',
                      !isToday && c.cur && isHoliday && 'text-brand-amber',
                      !isToday && c.cur && !isHoliday && isWeekend && 'text-ink-3',
                      !isToday && c.cur && !isHoliday && !isWeekend && 'text-ink',
                    )}>
                      {c.day}
                    </div>
                  </div>

                  {/* Chips — solid color, single line, macOS style */}
                  <div className="flex-1 min-h-0 space-y-[2px]">
                    {dayEntries.slice(0, 3).map((e) => {
                      const colorIdx = (e.customerId || 0) % 5;
                      const chipColors = [
                        'bg-brand-indigo text-white',
                        'bg-brand-emerald text-white',
                        'bg-brand-amber text-white',
                        'bg-brand-cyan text-white',
                        'bg-brand-violet text-white',
                      ];
                      return (
                        <div key={e.id} className={clsx(
                          'flex items-center gap-1 text-[10.5px] font-medium rounded px-1.5 py-[2px] leading-tight',
                          chipColors[colorIdx]
                        )}>
                          <span className="flex-1 truncate">{e.customer.name.split(' ')[0]}</span>
                          <span className="font-mono font-semibold opacity-90 flex-shrink-0 text-[10px]">
                            {fmtHours(entryHours(e))}
                          </span>
                        </div>
                      );
                    })}
                    {dayEntries.length > 3 && (
                      <div className="text-[10px] font-semibold text-ink-3 pl-1 pt-0.5">
                        +{dayEntries.length - 3} daha
                      </div>
                    )}
                  </div>

                  {/* Total — bottom right, only if entries exist */}
                  {totalHours > 0 && (
                    <div className="absolute bottom-1 right-1.5 text-[9.5px] font-mono font-semibold text-ink-3">
                      {fmtHours(totalHours)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

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
    <div className="bg-surface border border-paper-3 rounded-xl px-3 py-2.5 transition-colors hover:border-paper-4">
      <div className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={clsx(
        'text-xl sm:text-[22px] font-bold font-mono tracking-tight leading-tight',
        variant === 'indigo' && 'text-brand-indigo',
        variant === 'emerald' && 'text-brand-emerald',
        variant === 'neutral' && 'text-ink'
      )}>{value}</div>
    </div>
  );
}

function TimesheetActions() {
  const openWizard = useQuickEntry((s) => s.openWizard);
  const openBulkAI = useQuickEntry((s) => s.openBulkAI);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
      <button
        onClick={openWizard}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-grad-primary text-white text-xs font-bold hover:-translate-y-0.5 transition-all shadow-glow"
        title="Hızlı Kayıt"
      >
        <Zap size={13} />
        Hızlı Kayıt
      </button>
      <button
        onClick={openBulkAI}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border-2 border-brand-indigo text-brand-indigo text-xs font-bold hover:bg-brand-indigo hover:text-white transition"
      >
        <Wand2 size={13} />
        AI ile Toplu Giriş
      </button>
      <span className="text-[11px] text-ink-3 ml-auto hidden md:inline">
        💡 takvimde gün tıkla · sürükle ile birden fazla seç
      </span>
    </div>
  );
}

function LastEntryCard({ entries }: { entries: Entry[] }) {
  // Last single entry by date
  const last = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date))[0],
    [entries]
  );

  return (
    <div className="bg-surface border border-paper-3 rounded-xl px-3 py-2.5 transition-colors hover:border-paper-4 flex flex-col">
      <div className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-0.5">
        Son Kayıt
      </div>
      {!last ? (
        <div className="text-[12.5px] text-ink-4 flex-1 flex items-center">Henüz yok</div>
      ) : (
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-md bg-paper-2 text-ink-2 flex flex-col items-center justify-center flex-shrink-0 leading-none">
            <span className="text-[8px] font-semibold text-ink-3 uppercase">
              {MONTHS[new Date(last.date + 'T00:00:00').getMonth()].substring(0, 3)}
            </span>
            <span className="text-[11.5px] font-bold">
              {new Date(last.date + 'T00:00:00').getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold truncate text-ink leading-tight">
              {last.customer.name}
            </div>
            <div className="text-[10px] text-ink-3 truncate leading-tight">
              {last.activity.name}
            </div>
          </div>
          <div className="text-[11.5px] font-mono font-bold text-brand-indigo flex-shrink-0">
            {fmtHours(entryHours(last))}
          </div>
        </div>
      )}
    </div>
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
  const { user: me } = useAuth();
  const defaultAct = (me?.defaultActivityId || '') as number | '';
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [adding, setAdding] = useState(entries.length === 0);
  const [addKey, setAddKey] = useState(0); // başarılı eklemede formu sıfırla
  const toast = useToast();
  const qc = useQueryClient();

  type Payload = { cusId: number; projId: number | ''; actId: number; qty: number; ticketId: string | null; note: string | null };

  const addMut = useMutation({
    mutationFn: (p: Payload) => api.post('/entries', { date, qty: p.qty, customerId: p.cusId, projectId: p.projId || undefined, activityId: p.actId, ticketId: p.ticketId, note: p.note }),
    onSuccess: (_data, p) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      setAddKey((k) => k + 1);
      const prevHours = entries.reduce((s, e) => s + entryHours(e), 0);
      const act = activities.find((a) => a.id === p.actId);
      const newH = prevHours + (act?.unit === 'saat' ? p.qty : p.qty * 8);
      if (prevHours < 8 && newH >= 8) { confettiBurst(); toast.show('🔥 8 saati tamamladın!'); }
      else toast.show(`✓ Kayıt eklendi · ${fmtHours(newH)} bugün`);
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, p }: { id: number; p: Payload }) => api.put(`/entries/${id}`, { qty: p.qty, customerId: p.cusId, projectId: p.projId || undefined, activityId: p.actId, ticketId: p.ticketId, note: p.note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entries'] }); setEditingId(null); toast.show('✓ Güncellendi'); },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/entries/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entries'] }); setConfirmDeleteId(null); toast.show('Kayıt silindi'); },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const busy = addMut.isPending || updateMut.isPending || delMut.isPending;
  const dayTotal = entries.reduce((s, e) => s + entryHours(e), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      busy={busy}
      busyLabel={editingId ? 'Güncelleniyor…' : 'Kaydediliyor…'}
      title={
        <div className="flex items-center gap-2.5">
          <span className="grad-text">{DAYS_LONG[d.getDay()]}</span>
          <span className="text-ink-3 font-bold">·</span>
          <span>{d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</span>
          {dayTotal > 0 && <span className="ml-1 tag font-bold">{fmtHours(dayTotal)}</span>}
        </div>
      }
      footer={<button className="btn" onClick={onClose}>Kapat</button>}
    >
      {/* Bugünün kayıtları */}
      <div className="space-y-2">
        {entries.length === 0 && !adding && (
          <div className="text-center py-8 text-ink-3 text-sm">Bu güne henüz kayıt yok.</div>
        )}
        {entries.map((e) =>
          editingId === e.id ? (
            <div key={e.id} className="rounded-2xl ring-1 ring-brand-indigo/30 bg-brand-indigo/[.04] p-4">
              <div className="clabel mb-3 text-brand-indigo">Kaydı Düzenle</div>
              <EntryForm
                entry={e}
                customers={customers}
                activities={activities}
                defaultActivityId={defaultAct}
                submitLabel="Güncelle"
                submitting={updateMut.isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={(p) => updateMut.mutate({ id: e.id, p })}
              />
            </div>
          ) : (
            <div key={e.id} className="group flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-paper-2 hover:bg-paper-3/40 transition">
              <div className="w-1 self-stretch rounded-full bg-brand-indigo/30 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[13.5px] truncate">{e.customer.name}</span>
                  <span className="text-ink-3 text-[12.5px]">{e.activity.name}</span>
                  {e.ticketId && <span className="font-mono text-[10.5px] text-ink-3 bg-surface border border-paper-3 rounded px-1.5 py-0.5">{e.ticketId}</span>}
                </div>
                {e.note && <div className="text-[11.5px] text-ink-3 mt-0.5 truncate">{e.note}</div>}
              </div>
              <span className="font-mono font-bold text-sm text-ink flex-shrink-0">{fmtHours(entryHours(e))}</span>
              {confirmDeleteId === e.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => delMut.mutate(e.id)} className="text-[11px] font-bold bg-brand-rose text-white px-2.5 py-1 rounded-lg hover:bg-brand-rose/90">Sil</button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-semibold text-ink-2 px-2 py-1 rounded-lg hover:bg-paper-3">Vazgeç</button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(e.id); setAdding(false); }} className="text-brand-indigo hover:bg-brand-indigo/10 p-1.5 rounded-lg" title="Düzenle"><Pencil size={14} /></button>
                  <button onClick={() => setConfirmDeleteId(e.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg" title="Sil"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Yeni kayıt */}
      <div className="mt-4">
        {adding ? (
          <div className="rounded-2xl border border-paper-3 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="clabel">Yeni Kayıt</div>
              {entries.length > 0 && (
                <button onClick={() => setAdding(false)} className="text-ink-3 hover:text-ink p-1 rounded-lg" title="Kapat"><X size={15} /></button>
              )}
            </div>
            <EntryForm
              key={addKey}
              customers={customers}
              activities={activities}
              defaultActivityId={defaultAct}
              submitLabel="Kaydet"
              submitting={addMut.isPending}
              onSubmit={(p) => addMut.mutate(p)}
            />
          </div>
        ) : (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="w-full border-2 border-dashed border-paper-3 hover:border-brand-indigo/50 rounded-2xl py-3.5 flex items-center justify-center gap-2 text-ink-3 hover:text-brand-indigo font-semibold text-sm transition"
          >
            <Plus size={16} /> Yeni Kayıt Ekle
          </button>
        )}
      </div>
    </Modal>
  );
}

// Tek bir kayıt formu — hem yeni kayıt hem inline düzenleme için kullanılır
function EntryForm({ entry, customers, activities, defaultActivityId, submitLabel, submitting, onSubmit, onCancel }: {
  entry?: Entry;
  customers: Customer[];
  activities: Activity[];
  defaultActivityId: number | '';
  submitLabel: string;
  submitting: boolean;
  onSubmit: (p: { cusId: number; projId: number | ''; actId: number; qty: number; ticketId: string | null; note: string | null }) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [cusId, setCusId] = useState<number | ''>(entry?.customerId ?? '');
  const [projId, setProjId] = useState<number | ''>(entry?.projectId ?? '');
  const [actId, setActId] = useState<number | ''>(entry?.activityId ?? defaultActivityId);
  const [qty, setQty] = useState(entry ? String(entry.qty) : '');
  const [ticketId, setTicketId] = useState(entry?.ticketId || '');
  const [note, setNote] = useState(entry?.note || '');

  const activeCustomers = customers.filter((c) => c.active !== false);
  const projOptions = (customers.find((c) => c.id === cusId)?.projects || []).filter((p) => p.active !== false);

  function chooseCustomer(id: number | '') {
    setCusId(id);
    const ap = (customers.find((c) => c.id === id)?.projects || []).filter((p) => p.active !== false);
    setProjId(ap.length === 1 ? ap[0].id : '');
  }
  function submit() {
    if (!cusId) return toast.show('Müşteri seçin', 'error');
    if (projOptions.length > 1 && !projId) return toast.show('Proje seçin', 'error');
    if (!actId) return toast.show('Aktivite seçin', 'error');
    const q = parseFloat(qty);
    if (!q || q <= 0) return toast.show('Geçerli süre girin', 'error');
    onSubmit({ cusId: cusId as number, projId, actId: actId as number, qty: q, ticketId: ticketId.trim() || null, note: note.trim() || null });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Müşteri</label>
          <select className="input" value={cusId} onChange={(e) => chooseCustomer(e.target.value ? +e.target.value : '')} autoFocus={!entry}>
            <option value="">— Seçin —</option>
            {activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Proje{projOptions.length > 1 && <span className="text-brand-rose"> *</span>}</label>
          {projOptions.length > 1 ? (
            <select className="input" value={projId} onChange={(e) => setProjId(e.target.value ? +e.target.value : '')}>
              <option value="">— Proje seçin —</option>
              {projOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <input className="input !bg-paper-2 text-ink-3" disabled value={projOptions[0]?.name || (cusId ? '—' : 'Önce müşteri seçin')} />
          )}
        </div>
        <div>
          <label className="label">Aktivite</label>
          <select className="input" value={actId} onChange={(e) => setActId(e.target.value ? +e.target.value : '')}>
            <option value="">— Seçin —</option>
            {activities.filter((a) => a.active !== false).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
          </select>
        </div>
        <div>
          <label className="label">Süre</label>
          <input className="input font-mono" type="number" step="0.25" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div>
        <label className="label">Talep ID</label>
        <input className="input font-mono" value={ticketId} onChange={(e) => setTicketId(e.target.value)} />
      </div>
      <div>
        <label className="label">Açıklama</label>
        <textarea className="input min-h-[84px] resize-y leading-relaxed" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Yapılan iş…" />
      </div>
      <div className="flex items-center justify-end gap-2 pt-0.5">
        {onCancel && <button className="btn btn-sm" onClick={onCancel} disabled={submitting}>Vazgeç</button>}
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>
          <Check size={14} /> {submitLabel}
        </button>
      </div>
    </div>
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
  const { user: me } = useAuth();
  const [cusId, setCusId] = useState<number | ''>('');
  const [actId, setActId] = useState<number | ''>(me?.defaultActivityId || '');
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
      title={<span className="grad-text">Toplu Aktivite Girişi</span>}
      footer={
        <>
          <button className="btn" onClick={onClose}>İptal</button>
          <button className="btn btn-primary" onClick={save}><Check size={15} /> Hepsine Ekle</button>
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
            {customers.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Aktivite Türü</label>
          <select className="input" value={actId} onChange={(e) => setActId(e.target.value ? +e.target.value : '')}>
            <option value="">— Seçin —</option>
            {activities.filter((a) => a.active !== false).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 mb-3">
        <div>
          <label className="label">Günlük Süre</label>
          <input className="input font-mono" type="number" step="0.25" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="8" />
        </div>
        <div>
          <label className="label">Talep ID</label>
          <input className="input font-mono" value={ticketId} onChange={(e) => setTicketId(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Açıklama</label>
        <textarea
          className="input min-h-[84px] resize-y leading-relaxed"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Yapılan iş…"
          rows={3}
        />
      </div>
    </Modal>
  );
}

