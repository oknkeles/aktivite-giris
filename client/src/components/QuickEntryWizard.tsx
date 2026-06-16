// Hızlı Kayıt Wizard — klavye odaklı, adım adım, tak tak tak girer.
// Cmd+K veya köşedeki FAB ile açılır. Her adımda Enter → sonraki step.
// 1 aylık aktiviteyi 5 dk'da girmek için tasarlandı.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Zap, X, ChevronRight, ChevronLeft, RotateCcw, Check,
  Briefcase, Calendar as CalIcon, Clock, FileText, Sparkles, CalendarDays,
} from 'lucide-react';
import clsx from 'clsx';
import { api, type Customer, type Activity } from '../api/client';
import { useAuth } from '../store/auth';
import { useToast, confettiBurst } from './Toast';
import { dateStr, MONTHS, DAYS_LONG, DAYS_SHORT } from '../lib/format';

type Step = 'customer' | 'activity' | 'date' | 'qty' | 'note';

interface Draft {
  customerId?: number;
  customerName?: string;
  activityId?: number;
  activityName?: string;
  activityUnit?: string;
  date?: string;
  qty?: number;
  ticketId?: string | null;
  note?: string | null;
}

const STEPS: { key: Step; label: string; icon: any }[] = [
  { key: 'customer', label: 'Müşteri / Proje', icon: Briefcase },
  { key: 'activity', label: 'Aktivite Türü', icon: Sparkles },
  { key: 'date', label: 'Tarih', icon: CalIcon },
  { key: 'qty', label: 'Süre', icon: Clock },
  { key: 'note', label: 'Açıklama', icon: FileText },
];

// ─── Yardımcılar ───────────────────────────────────────────────────────

const TR_MONTHS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
  'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];

function parseDate(input: string, lastDate: string | null): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return lastDate || dateStr(new Date());

  if (['bugün', 'bugun', 'today', 'b'].includes(s)) return dateStr(new Date());
  if (['dün', 'dun', 'yesterday', 'd'].includes(s)) {
    const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d);
  }
  if (['yarın', 'yarin', 'tomorrow'].includes(s)) {
    const d = new Date(); d.setDate(d.getDate() + 1); return dateStr(d);
  }

  // +N / -N → lastDate'e göre kaydır
  const rel = s.match(/^([+-])(\d+)$/);
  if (rel) {
    const base = lastDate ? new Date(lastDate + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + parseInt(rel[2], 10) * (rel[1] === '+' ? 1 : -1));
    return dateStr(base);
  }

  // "29.5", "29/5", "29-5", "29 5", "29.5.2026"
  const num = s.match(/^(\d{1,2})[./\- ](\d{1,2})(?:[./\- ](\d{2,4}))?$/);
  if (num) {
    const day = +num[1], month = +num[2];
    let year = num[3] ? +num[3] : new Date().getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (d.getMonth() === month - 1 && d.getDate() === day) return dateStr(d);
  }

  // "29 mayıs", "1 haziran"
  const named = s.match(/^(\d{1,2})\s+(\w+)$/);
  if (named) {
    const day = +named[1];
    const monthIdx = TR_MONTHS.findIndex((m) => m.startsWith(named[2]));
    if (monthIdx !== -1) {
      const d = new Date(new Date().getFullYear(), monthIdx, day);
      if (d.getMonth() === monthIdx && d.getDate() === day) return dateStr(d);
    }
  }

  // Sadece gün → bu ayın o günü
  const justDay = s.match(/^(\d{1,2})$/);
  if (justDay) {
    const day = +justDay[1];
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d.getDate() === day) return dateStr(d);
  }

  return null;
}

function fmtPrettyDate(s: string): string {
  const d = new Date(s + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${DAYS_LONG[d.getDay()]}`;
}

function fuzzy<T>(items: T[], q: string, getKey: (i: T) => string): T[] {
  if (!q.trim()) return items;
  const query = q.toLowerCase().trim();
  return items
    .map((item) => {
      const k = getKey(item).toLowerCase();
      let score = 0;
      if (k === query) score = 100;
      else if (k.startsWith(query)) score = 80;
      else if (k.includes(query)) score = 60;
      else {
        let qi = 0;
        for (let i = 0; i < k.length && qi < query.length; i++) {
          if (k[i] === query[qi]) qi++;
        }
        if (qi === query.length) score = 20;
      }
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

function extractTicket(text: string): { ticketId: string | null; note: string | null } {
  const m = text.match(/^([A-Z]{2,8}-\d+)\s*(.*)$/);
  if (m) return { ticketId: m[1], note: m[2].trim() || null };
  return { ticketId: null, note: text.trim() || null };
}

function parseQty(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t === 'yarım' || t === 'yarim' || t === 'half') return 4;
  if (t === 'tam' || t === 'full' || t === 'gün' || t === 'gun') return 8;
  const n = parseFloat(t.replace(',', '.'));
  if (!isNaN(n) && n > 0) return n;
  return null;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function QuickEntryWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const me = useAuth((s) => s.user);

  const [step, setStep] = useState<Step>('customer');
  const [draft, setDraft] = useState<Draft>({});
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [savedHistory, setSavedHistory] = useState<{ summary: string; id: number }[]>([]);
  const [error, setError] = useState<string>('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: customersAll = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
    enabled: open,
  });
  const { data: activitiesAll = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
    enabled: open,
  });
  // Hızlı kayıt yeni giriş içindir → pasif müşteri/aktivite seçilemesin
  const customers = customersAll.filter((c) => c.active !== false);
  const activities = activitiesAll.filter((a) => a.active !== false);

  const addMut = useMutation({
    mutationFn: (d: Draft) =>
      api.post<{ id: number }>('/entries', {
        date: d.date,
        qty: d.qty,
        customerId: d.customerId,
        activityId: d.activityId,
        ticketId: d.ticketId || null,
        note: d.note || null,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      setSavedCount((n) => n + 1);
      const summary = `${draft.customerName} · ${fmtPrettyDate(draft.date!)} · ${draft.qty}s`;
      setSavedHistory((h) => [{ summary, id: (res as any).id }, ...h].slice(0, 6));
      setLastDate(draft.date!);
      // Reset, baş steplere dön
      setDraft({ activityId: draft.activityId, activityName: draft.activityName, activityUnit: draft.activityUnit });
      setSearch('');
      setHighlightIdx(0);
      setStep('customer');
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    onError: (e: any) => {
      setError(e.message || 'Hata');
      toast.show('Kayıt eklenemedi: ' + (e.message || ''), 'error');
    },
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      setSavedCount((n) => Math.max(0, n - 1));
      toast.show('Son kayıt geri alındı');
    },
  });

  // Suggestions (her step için)
  const customerSuggestions = useMemo(
    () => fuzzy(customers, search, (c) => c.name).slice(0, 6),
    [customers, search]
  );
  const activitySuggestions = useMemo(() => {
    const list = fuzzy(activities, search, (a) => a.name).slice(0, 6);
    // Arama yokken kullanıcının varsayılan aktivitesini en üste taşı
    if (!search.trim() && me?.defaultActivityId) {
      const def = list.find((a) => a.id === me.defaultActivityId);
      if (def) return [def, ...list.filter((a) => a.id !== def.id)];
    }
    return list;
  }, [activities, search, me?.defaultActivityId]);
  const parsedDate = step === 'date' ? parseDate(search, lastDate) : null;
  const parsedQty = step === 'qty' ? parseQty(search) : null;

  // Açılışta kullanıcının varsayılan aktivitesini draft'a kur
  useEffect(() => {
    if (!open) return;
    if (draft.activityId) return; // zaten var (önceki save'den kalmış)
    if (!me?.defaultActivityId || activities.length === 0) return;
    const def = activities.find((a) => a.id === me.defaultActivityId);
    if (def) {
      setDraft((d) => ({ ...d, activityId: def.id, activityName: def.name, activityUnit: def.unit }));
    }
  }, [open, me?.defaultActivityId, activities, draft.activityId]);

  // Focus management
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, step]);

  // Step değişince search reset
  useEffect(() => {
    setSearch('');
    setHighlightIdx(0);
    setError('');
  }, [step]);

  // Cmd+K global shortcut (parent'tan açılır ama burada Esc'i de yakalayalım)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (search) setSearch('');
        else if (step !== 'customer') goBack();
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, search]);

  function goBack() {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1].key);
  }

  function commitCustomer(c: Customer) {
    // Kullanıcının default aktivitesi varsa burada da garantile (useEffect race fix)
    const defAct = me?.defaultActivityId
      ? activities.find((a) => a.id === me.defaultActivityId)
      : null;

    setDraft((d) => ({
      ...d,
      customerId: c.id,
      customerName: c.name,
      // Önceki save'den kalmadıysa ama default varsa şimdi ekle
      ...(d.activityId
        ? {}
        : defAct
        ? { activityId: defAct.id, activityName: defAct.name, activityUnit: defAct.unit }
        : {}),
    }));

    // Aktivite (önceden veya default'tan) varsa direkt tarihe geç
    const hasActivity = !!draft.activityId || !!defAct;
    setStep(hasActivity ? 'date' : 'activity');
  }
  function commitActivity(a: Activity) {
    setDraft((d) => ({ ...d, activityId: a.id, activityName: a.name, activityUnit: a.unit }));
    setStep('date');
  }
  function commitDate() {
    if (!parsedDate) { setError('Tarih anlamadım. Örn: "bugün", "29.5", "+1"'); return; }
    setDraft((d) => ({ ...d, date: parsedDate }));
    setStep('qty');
  }
  function commitQty() {
    if (!parsedQty) { setError('Süre giriniz. Örn: "8", "yarım", "0.5"'); return; }
    setDraft((d) => ({ ...d, qty: parsedQty }));
    setStep('note');
  }
  function commitNote(skip = false) {
    const final = { ...draft };
    if (!skip && search.trim()) {
      const ex = extractTicket(search);
      final.ticketId = ex.ticketId;
      final.note = ex.note;
    } else {
      final.ticketId = null;
      final.note = null;
    }
    if (!final.customerId || !final.activityId || !final.date || !final.qty) {
      setError('Eksik alan var, başa dön');
      return;
    }
    addMut.mutate(final);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      if (step === 'note') commitNote(true);
      return;
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      goBack();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (step === 'customer') {
        setHighlightIdx((i) => Math.min(i + 1, customerSuggestions.length - 1));
      } else if (step === 'activity') {
        setHighlightIdx((i) => Math.min(i + 1, activitySuggestions.length - 1));
      }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (step === 'customer') {
        const sel = customerSuggestions[highlightIdx];
        if (sel) commitCustomer(sel);
      } else if (step === 'activity') {
        const sel = activitySuggestions[highlightIdx];
        if (sel) commitActivity(sel);
      } else if (step === 'date') {
        commitDate();
      } else if (step === 'qty') {
        commitQty();
      } else if (step === 'note') {
        commitNote(false);
      }
    }
  }

  if (!open) return null;

  const stepLabel: Record<Step, string> = {
    customer: 'Müşteri',
    activity: 'Aktivite',
    date: 'Tarih',
    qty: 'Süre (saat)',
    note: 'Açıklama',
  };

  const placeholder: Record<Step, string> = {
    customer: 'Müşteri ara...',
    activity: 'Aktivite ara...',
    date: 'bugün · 29.5 · +1',
    qty: '8 · 0.5 · yarım',
    note: 'Açıklama (Tab ile geç)',
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in"
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        {/* Compact header — sadece ikon + sayaç + kapat */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-paper-3">
          <div className="flex items-center gap-2 text-ink-2">
            <Zap size={15} className="text-brand-indigo" />
            <span className="text-[12.5px] font-bold">Hızlı Kayıt</span>
            {savedCount > 0 && (
              <span className="text-[10.5px] font-mono text-ink-3">· {savedCount}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {savedHistory.length > 0 && (
              <button
                onClick={() => delMut.mutate(savedHistory[0].id)}
                className="text-[11px] text-ink-3 hover:text-brand-rose px-2 py-1 rounded-md hover:bg-paper-2"
                title="Son kaydı geri al"
              >
                ↶
              </button>
            )}
            <button
              onClick={() => { setDraft({}); setSearch(''); setStep('customer'); }}
              className="text-ink-3 hover:text-ink-2 p-1 rounded-md hover:bg-paper-2"
              title="Sıfırla"
            >
              <RotateCcw size={13} />
            </button>
            <button onClick={onClose} className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-paper-2">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Draft chips — sadece dolular */}
        {(draft.customerName || draft.activityName || draft.date || draft.qty !== undefined) && (
          <div className="px-4 pt-3 flex flex-wrap gap-1 text-[11px]">
            {draft.customerName && (
              <span className="badge bg-brand-indigo/10 text-brand-indigo">{draft.customerName}</span>
            )}
            {draft.activityName && (
              <span className="badge bg-brand-amber/15 text-brand-amber">✨ {draft.activityName}</span>
            )}
            {draft.date && (
              <span className="badge bg-brand-cyan/10 text-brand-cyan">{fmtPrettyDate(draft.date)}</span>
            )}
            {draft.qty !== undefined && (
              <span className="badge bg-brand-emerald/10 text-brand-emerald">{draft.qty}s</span>
            )}
          </div>
        )}

        {/* Input alanı */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[10.5px] font-bold text-ink-3 uppercase tracking-wider">
              {stepLabel[step]}
            </label>
            {step === 'date' && (
              <button
                onClick={() => setCalendarOpen((o) => !o)}
                className={clsx(
                  'flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md transition',
                  calendarOpen
                    ? 'bg-brand-indigo text-white'
                    : 'bg-paper-2 text-ink-2 hover:bg-paper-3'
                )}
                title="Takvim aç/kapat"
              >
                <CalendarDays size={11} />
                Takvim
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder[step]}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-paper-3 bg-surface text-[15px] text-ink outline-none focus:border-brand-indigo focus:ring-4 focus:ring-brand-indigo/10 transition-all"
            autoFocus
          />
          {error && <div className="text-[11px] text-brand-rose mt-1.5 px-1">{error}</div>}

          {/* Date/Qty preview — varsa kompakt */}
          {step === 'date' && parsedDate && !calendarOpen && (
            <div className="mt-2 text-[11.5px] text-brand-indigo font-semibold px-1">
              → {fmtPrettyDate(parsedDate)}
            </div>
          )}

          {/* Mini takvim — sadece date step + toggle açıkken */}
          {step === 'date' && calendarOpen && (
            <MiniCalendar
              value={parsedDate}
              lastDate={lastDate}
              onSelect={(picked) => {
                setDraft((d) => ({ ...d, date: picked }));
                setSearch('');
                setCalendarOpen(false);
                setStep('qty');
              }}
            />
          )}
          {step === 'qty' && parsedQty !== null && (
            <div className="mt-2 text-[11.5px] text-brand-emerald font-semibold px-1">
              → {parsedQty} saat
            </div>
          )}
          {step === 'note' && search.trim() && (() => {
            const ex = extractTicket(search);
            if (!ex.ticketId) return null;
            return (
              <div className="mt-2 text-[11.5px] text-ink-3 px-1">
                Talep: <code className="font-bold text-brand-violet">{ex.ticketId}</code>
                {ex.note && <span className="text-ink-3"> · {ex.note}</span>}
              </div>
            );
          })()}
        </div>

        {/* Customer/Activity suggestions */}
        {(step === 'customer' || step === 'activity') && (
          <div className="px-2 pb-2 max-h-[260px] overflow-y-auto">
            {(step === 'customer' ? customerSuggestions : activitySuggestions).length === 0 ? (
              <div className="text-[11px] text-ink-3 px-3 py-2">Eşleşme yok</div>
            ) : (
              (step === 'customer' ? customerSuggestions : activitySuggestions).map((item: any, i) => (
                <button
                  key={item.id}
                  onClick={() => step === 'customer' ? commitCustomer(item) : commitActivity(item)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={clsx(
                    'w-full text-left px-3 py-1.5 rounded-md text-[13.5px] flex items-center justify-between transition',
                    i === highlightIdx ? 'bg-brand-indigo/10 text-brand-indigo' : 'hover:bg-paper-2 text-ink'
                  )}
                >
                  <span className="font-medium">{item.name}</span>
                  {step === 'activity' && (
                    <span className="text-[10px] text-ink-3 font-normal ml-2">({item.unit})</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer — minimal hint */}
        <div className="px-4 py-2 border-t border-paper-3 flex items-center justify-between text-[10.5px] text-ink-3">
          <div className="flex items-center gap-2">
            <span className="font-mono">↵</span> devam
            <span className="text-ink-4">·</span>
            <span className="font-mono">⇧↹</span> geri
            <span className="text-ink-4">·</span>
            <span className="font-mono">esc</span> çık
          </div>
          {step === 'note' && (
            <button
              onClick={() => commitNote(false)}
              disabled={addMut.isPending}
              className="text-[11px] font-bold text-brand-indigo hover:underline"
            >
              {addMut.isPending ? 'Kaydediliyor...' : 'Kaydet ↵'}
            </button>
          )}
        </div>

        {/* Bu oturum geçmişi — minimal */}
        {savedHistory.length > 0 && (
          <div className="px-4 py-2 border-t border-paper-3 bg-paper-2/30 max-h-[88px] overflow-y-auto">
            {savedHistory.slice(0, 4).map((h, i) => (
              <div key={i} className="text-[11px] text-ink-2 flex items-center gap-1.5 leading-relaxed">
                <Check size={9} className="text-brand-emerald flex-shrink-0" />
                <span className="truncate">{h.summary}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MiniCalendar ─────────────────────────────────────────────────────
function MiniCalendar({
  value,
  lastDate,
  onSelect,
}: {
  value: string | null;
  lastDate: string | null;
  onSelect: (date: string) => void;
}) {
  const initial = value
    ? new Date(value + 'T00:00:00')
    : lastDate
    ? new Date(lastDate + 'T00:00:00')
    : new Date();
  const [viewDate, setViewDate] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = dateStr(new Date());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7; // Pzt = 0

  const cells: ({ day: number; date: string } | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, date });
  }

  return (
    <div className="mt-2 border border-paper-3 rounded-xl p-2.5 bg-paper-2/30">
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1 hover:bg-paper-3 rounded-md text-ink-2"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[12px] font-semibold text-ink">
          {MONTHS[month]} {year}
        </span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1 hover:bg-paper-3 rounded-md text-ink-2"
        >
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-bold text-ink-3 uppercase mb-1">
        {DAYS_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, i) =>
          c ? (
            <button
              key={i}
              onClick={() => onSelect(c.date)}
              className={clsx(
                'aspect-square rounded-md text-[12px] font-medium transition',
                value === c.date && 'bg-brand-indigo text-white font-bold',
                today === c.date &&
                  value !== c.date &&
                  'ring-1 ring-brand-indigo/40 text-brand-indigo font-bold',
                value !== c.date && today !== c.date && 'text-ink hover:bg-brand-indigo/10'
              )}
            >
              {c.day}
            </button>
          ) : (
            <div key={i} />
          )
        )}
      </div>
    </div>
  );
}
