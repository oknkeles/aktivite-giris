// Hızlı Kayıt Wizard — klavye odaklı, adım adım, tak tak tak girer.
// Cmd+K veya köşedeki FAB ile açılır. Her adımda Enter → sonraki step.
// 1 aylık aktiviteyi 5 dk'da girmek için tasarlandı.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Zap, X, ChevronRight, ChevronLeft, RotateCcw, Check,
  Briefcase, Calendar as CalIcon, Clock, FileText, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { api, type Customer, type Activity } from '../api/client';
import { useAuth } from '../store/auth';
import { useToast, confettiBurst } from './Toast';
import { dateStr, MONTHS, DAYS_LONG } from '../lib/format';

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

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
    enabled: open,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
    enabled: open,
  });

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

  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const StepIcon = STEPS[stepIdx].icon;

  return (
    <div className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-grad-primary text-white px-5 sm:px-6 py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Zap size={20} className="text-white" />
            <div>
              <div className="font-extrabold text-base leading-tight">Hızlı Kayıt</div>
              <div className="text-[11px] text-white/75">
                {savedCount > 0 ? `${savedCount} kayıt eklendi` : 'Tak tak tak girer'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 sm:px-6 py-3 border-b border-paper-3 bg-paper-2/40 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <div key={s.key} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                    done && 'bg-brand-emerald text-white',
                    active && 'bg-brand-indigo text-white ring-2 ring-brand-indigo/20',
                    !done && !active && 'bg-paper-3 text-ink-3'
                  )}>
                    {done ? <Check size={11} /> : i + 1}
                  </div>
                  <div className={clsx(
                    'text-[10.5px] font-semibold truncate',
                    active ? 'text-brand-indigo' : done ? 'text-brand-emerald' : 'text-ink-3'
                  )}>
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={clsx('h-px flex-1', done ? 'bg-brand-emerald' : 'bg-paper-3')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main */}
        <div className="px-5 sm:px-6 py-5 flex-1 overflow-y-auto">
          {/* Draft özet (üstte) */}
          {(draft.customerName || draft.activityName || draft.date || draft.qty) && (
            <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
              {draft.customerName && (
                <span className="badge bg-brand-indigo/10 text-brand-indigo">
                  🏢 {draft.customerName}
                </span>
              )}
              {draft.activityName && (
                <span className="badge bg-brand-violet/10 text-brand-violet">
                  ✨ {draft.activityName}
                </span>
              )}
              {draft.date && (
                <span className="badge bg-brand-cyan/10 text-brand-cyan">
                  📅 {fmtPrettyDate(draft.date)}
                </span>
              )}
              {draft.qty !== undefined && (
                <span className="badge bg-brand-emerald/10 text-brand-emerald">
                  ⏱ {draft.qty}s
                </span>
              )}
            </div>
          )}

          {/* Step başlığı */}
          <div className="flex items-center gap-2 mb-3">
            <StepIcon size={18} className="text-brand-indigo" />
            <div className="font-bold text-lg">{STEPS[stepIdx].label}</div>
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder={
              step === 'customer' ? 'Müşteri ara... (örn: aktek)' :
              step === 'activity' ? 'Aktivite ara... (örn: expert)' :
              step === 'date' ? 'bugün · dün · 29.5 · +1 · 1 mayıs · 29' :
              step === 'qty' ? '8 · 0.5 · yarım · tam' :
              'Açıklama (JIRA-123 ile başlarsan otomatik talep ID olur) — geçmek için Tab'
            }
            className="input text-base !py-3"
            autoFocus
          />

          {error && (
            <div className="text-xs text-brand-rose mt-2 px-1">{error}</div>
          )}

          {/* Suggestions */}
          {step === 'customer' && (
            <div className="mt-3 space-y-1">
              {customerSuggestions.length === 0 ? (
                <div className="text-xs text-ink-3 py-3 text-center">Eşleşme yok. Önce müşteri ekle.</div>
              ) : customerSuggestions.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => commitCustomer(c)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition',
                    i === highlightIdx ? 'bg-brand-indigo/10 text-brand-indigo' : 'hover:bg-paper-2'
                  )}
                >
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    {c.contractor && <div className="text-[10.5px] text-ink-3">{c.contractor.name}</div>}
                  </div>
                  {i === highlightIdx && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
          )}

          {step === 'activity' && (
            <div className="mt-3 space-y-1">
              {activitySuggestions.length === 0 ? (
                <div className="text-xs text-ink-3 py-3 text-center">Eşleşme yok</div>
              ) : activitySuggestions.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => commitActivity(a)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition',
                    i === highlightIdx ? 'bg-brand-indigo/10 text-brand-indigo' : 'hover:bg-paper-2'
                  )}
                >
                  <div className="font-semibold flex items-center gap-2">
                    {a.name}
                    <span className="text-[10px] text-ink-3 font-normal">({a.unit})</span>
                  </div>
                  {i === highlightIdx && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
          )}

          {step === 'date' && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-ink-3 px-1">
                💡 İpuçları: <code>bugün</code> · <code>dün</code> · <code>+1</code> (son tarihten +1 gün) · <code>29.5</code> · <code>1 mayıs</code> · <code>15</code> (bu ayın 15'i)
              </div>
              {parsedDate && (
                <div className="bg-brand-indigo/10 border border-brand-indigo/30 rounded-lg px-3 py-2 text-sm font-semibold text-brand-indigo flex items-center justify-between">
                  <span>→ {fmtPrettyDate(parsedDate)}</span>
                  <span className="text-[11px] font-normal text-ink-3">Enter ile devam</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['bugün', 'dün', '+1', '-1'].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSearch(s); }}
                    className="px-2.5 py-1 rounded-lg bg-paper-2 hover:bg-paper-3 text-xs font-semibold"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'qty' && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-ink-3 px-1">
                💡 <code>8</code> · <code>0.5</code> · <code>yarım</code> (=4) · <code>tam</code> (=8)
              </div>
              {parsedQty !== null && (
                <div className="bg-brand-emerald/10 border border-brand-emerald/30 rounded-lg px-3 py-2 text-sm font-semibold text-brand-emerald flex items-center justify-between">
                  <span>→ {parsedQty} saat</span>
                  <span className="text-[11px] font-normal text-ink-3">Enter ile devam</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['2', '4', '6', '8'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSearch(s)}
                    className="px-3 py-1.5 rounded-lg bg-paper-2 hover:bg-paper-3 text-xs font-bold font-mono"
                  >
                    {s} saat
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'note' && (
            <div className="mt-3 space-y-2">
              <div className="text-[11px] text-ink-3 px-1">
                💡 İsteğe bağlı. Tab veya boş Enter ile geç. JIRA-123 ile başlarsa talep ID olarak ayrılır.
              </div>
              {search.trim() && (() => {
                const ex = extractTicket(search);
                return (
                  <div className="bg-paper-2 rounded-lg px-3 py-2 text-xs space-y-1">
                    {ex.ticketId && (
                      <div><span className="text-ink-3">Talep ID:</span> <code className="font-bold text-brand-violet">{ex.ticketId}</code></div>
                    )}
                    {ex.note && (
                      <div><span className="text-ink-3">Açıklama:</span> {ex.note}</div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-paper-3 bg-paper-2/40 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={goBack}
              disabled={stepIdx === 0}
              className="btn btn-sm disabled:opacity-30"
              title="Shift+Tab"
            >
              <ChevronLeft size={13} /> Geri
            </button>
            <button
              onClick={() => { setDraft({}); setSearch(''); setStep('customer'); }}
              className="btn btn-sm btn-ghost"
              title="Sıfırla"
            >
              <RotateCcw size={12} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {savedHistory.length > 0 && (
              <button
                onClick={() => delMut.mutate(savedHistory[0].id)}
                className="text-[11px] text-ink-3 hover:text-brand-rose"
                title="Son eklenen kaydı geri al"
              >
                ↶ Geri al
              </button>
            )}
            {step === 'note' ? (
              <button
                onClick={() => commitNote(false)}
                className="btn btn-primary btn-sm"
                disabled={addMut.isPending}
              >
                <Check size={13} /> Kaydet & Yeni Giriş
              </button>
            ) : (
              <span className="text-[10.5px] text-ink-3 italic">
                Enter ile devam · Esc ile çık
              </span>
            )}
          </div>
        </div>

        {/* Son eklenenler */}
        {savedHistory.length > 0 && (
          <div className="px-5 sm:px-6 py-2 border-t border-paper-3 bg-paper-2/20 max-h-24 overflow-y-auto flex-shrink-0">
            <div className="text-[10px] font-bold text-ink-3 uppercase tracking-wider mb-1">Bu oturumda eklenen ({savedHistory.length})</div>
            <div className="space-y-0.5">
              {savedHistory.map((h, i) => (
                <div key={i} className="text-[11px] text-ink-2 flex items-center gap-1.5">
                  <Check size={10} className="text-brand-emerald flex-shrink-0" />
                  <span className="truncate">{h.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
