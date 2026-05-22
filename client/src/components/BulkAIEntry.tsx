// AI ile Toplu Giriş — kullanıcı serbest metin yapıştırır, Gemini parse eder,
// her satır düzenlenebilir bir önizleme olarak gösterilir, onaylanan satırlar
// DB'ye yazılır.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X, Check, AlertTriangle, Trash2, Loader2, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { api, type Customer, type Activity } from '../api/client';
import { useToast } from './Toast';
import { MONTHS } from '../lib/format';

interface ParsedEntry {
  rawLine: string;
  ok: boolean;
  warning?: string;
  date?: string;
  qty?: number;
  customerId?: number;
  customerName?: string;
  activityId?: number;
  activityName?: string;
  ticketId?: string | null;
  note?: string | null;
}

const EXAMPLE = `oypa destek dijital ik 9001 bt ekleme 4 saat / FO2375
Erdemir Satıcı kartı oluşturma 8 mayıs 2 saat
Şenpiliç aktivite bordro zarfı alan ekleme 8 mayıs 4 saat
Erdemir İlt: Temsilci izni saat kodunun düzeltilmesi 13 mayıs 1 saat FO2655
Eti ek alanlar 2 saat 14 mayıs
Oypa FO2590 21.05 BT 100 üst biriminde otomatik kayıt 4 saat`;

function fmtDate(s: string): string {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()].substring(0, 3)}`;
}

export default function BulkAIEntry({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedEntry[]>([]);
  const [stage, setStage] = useState<'input' | 'preview'>('input');

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

  const parseMut = useMutation({
    mutationFn: () => api.post<{ entries: ParsedEntry[] }>('/entries/bulk-parse', { text }),
    onSuccess: (data) => {
      setParsed(data.entries);
      setStage('preview');
    },
    onError: (e: any) => toast.show(e.message || 'AI hatası', 'error'),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const validEntries = parsed
        .filter((p) => p.ok && p.customerId && p.activityId && p.date && p.qty)
        .map((p) => ({
          date: p.date!,
          qty: p.qty!,
          customerId: p.customerId!,
          activityId: p.activityId!,
          ticketId: p.ticketId || null,
          note: p.note || null,
        }));
      return api.post<{ created: number }>('/entries/bulk-create', { entries: validEntries });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      toast.show(`🎉 ${data.created} kayıt eklendi!`);
      handleClose();
    },
    onError: (e: any) => toast.show(e.message || 'Kayıt hatası', 'error'),
  });

  function handleClose() {
    setText('');
    setParsed([]);
    setStage('input');
    onClose();
  }

  function updateEntry(idx: number, patch: Partial<ParsedEntry>) {
    setParsed((arr) =>
      arr.map((e, i) => {
        if (i !== idx) return e;
        const next = { ...e, ...patch };
        // ID değişti → name güncelle
        if (patch.customerId !== undefined) {
          const c = customers.find((x) => x.id === patch.customerId);
          next.customerName = c?.name;
        }
        if (patch.activityId !== undefined) {
          const a = activities.find((x) => x.id === patch.activityId);
          next.activityName = a?.name;
        }
        // Geçerlilik tekrar değerlendir
        next.ok = !!(next.customerId && next.activityId && next.date && next.qty);
        if (next.ok) next.warning = undefined;
        return next;
      })
    );
  }

  function removeEntry(idx: number) {
    setParsed((arr) => arr.filter((_, i) => i !== idx));
  }

  if (!open) return null;

  const okCount = parsed.filter((p) => p.ok).length;
  const warnCount = parsed.length - okCount;

  return (
    <div
      className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-grad-primary text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Wand2 size={18} />
            <div>
              <div className="font-extrabold text-base leading-tight">AI Toplu Giriş</div>
              <div className="text-[11px] text-white/75">
                {stage === 'input'
                  ? 'Metni yapıştır, AI satırları aktiviteye çevirsin'
                  : `${okCount} hazır · ${warnCount > 0 ? `${warnCount} uyarı` : 'hata yok'}`}
              </div>
            </div>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* INPUT STAGE */}
        {stage === 'input' && (
          <div className="px-5 py-4 flex-1 overflow-y-auto">
            <label className="block text-[10.5px] font-bold text-ink-3 uppercase tracking-wider mb-2">
              Aktivite Metni
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Her satıra bir aktivite yaz. Örnek:\n\n${EXAMPLE}`}
              rows={14}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-paper-3 bg-white text-sm font-mono leading-relaxed text-ink outline-none focus:border-brand-indigo focus:ring-4 focus:ring-brand-indigo/10 transition-all resize-y"
            />
            <div className="flex items-center justify-between mt-2 text-[11px] text-ink-3">
              <span>{text.split('\n').filter((l) => l.trim()).length} satır</span>
              <button onClick={() => setText(EXAMPLE)} className="text-brand-indigo hover:underline">
                Örnek metni doldur
              </button>
            </div>

            <div className="text-[11px] text-ink-3 bg-paper-2 rounded-lg p-3 mt-4 space-y-1">
              <div>💡 <strong>İpuçları:</strong></div>
              <div>• Her satıra bir aktivite — müşteri + ne yapıldı + tarih + saat + (opsiyonel) talep ID</div>
              <div>• Tarih yoksa bugün varsayılır, aktivite yoksa kullanıcı varsayılanı (örn. Expert)</div>
              <div>• AI parse edip her satırı düzenlenebilir kart olarak gösterecek — kaydetmeden önce kontrol edersin</div>
            </div>
          </div>
        )}

        {/* PREVIEW STAGE */}
        {stage === 'preview' && (
          <div className="px-5 py-4 flex-1 overflow-y-auto">
            <div className="text-[11.5px] text-ink-3 mb-3">
              AI {parsed.length} satır parse etti. Düzenle, kaldır veya doğrudan kaydet.
            </div>
            <div className="space-y-2">
              {parsed.map((e, i) => (
                <div
                  key={i}
                  className={clsx(
                    'border rounded-xl p-3 transition',
                    e.ok ? 'border-paper-3 bg-white' : 'border-brand-amber/40 bg-brand-amber/5'
                  )}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className={clsx('flex-shrink-0 mt-0.5', e.ok ? 'text-brand-emerald' : 'text-brand-amber')}>
                      {e.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] text-ink-3 font-mono mb-1 truncate">{e.rawLine}</div>
                      {!e.ok && e.warning && (
                        <div className="text-[11px] text-brand-amber font-semibold mb-1.5">⚠ {e.warning}</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeEntry(i)}
                      className="text-ink-3 hover:text-brand-rose p-1 rounded hover:bg-paper-2 flex-shrink-0"
                      title="Sil"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <select
                      value={e.customerId || ''}
                      onChange={(ev) => updateEntry(i, { customerId: ev.target.value ? +ev.target.value : undefined })}
                      className="input !py-1.5 !text-xs"
                    >
                      <option value="">— Müşteri —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                      value={e.activityId || ''}
                      onChange={(ev) => updateEntry(i, { activityId: ev.target.value ? +ev.target.value : undefined })}
                      className="input !py-1.5 !text-xs"
                    >
                      <option value="">— Aktivite —</option>
                      {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input
                      type="date"
                      value={e.date || ''}
                      onChange={(ev) => updateEntry(i, { date: ev.target.value || undefined })}
                      className="input !py-1.5 !text-xs font-mono"
                    />
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={e.qty || ''}
                      onChange={(ev) => updateEntry(i, { qty: ev.target.value ? +ev.target.value : undefined })}
                      placeholder="Saat"
                      className="input !py-1.5 !text-xs font-mono"
                    />
                    <input
                      value={e.ticketId || ''}
                      onChange={(ev) => updateEntry(i, { ticketId: ev.target.value || null })}
                      placeholder="Talep ID"
                      className="input !py-1.5 !text-xs font-mono"
                    />
                  </div>

                  <input
                    value={e.note || ''}
                    onChange={(ev) => updateEntry(i, { note: ev.target.value || null })}
                    placeholder="Açıklama"
                    className="input !py-1.5 !text-xs mt-2"
                  />
                </div>
              ))}
            </div>

            {parsed.length === 0 && (
              <div className="text-center py-12 text-ink-3">
                <div className="text-2xl mb-2">📭</div>
                <div className="text-sm">Tüm satırlar silindi</div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-paper-3 bg-paper-2/40 flex items-center justify-between gap-2 flex-shrink-0">
          {stage === 'input' ? (
            <>
              <button onClick={handleClose} className="btn">İptal</button>
              <button
                onClick={() => parseMut.mutate()}
                disabled={text.trim().length < 3 || parseMut.isPending}
                className="btn btn-primary"
              >
                {parseMut.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> AI parse ediyor...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> AI ile Parse Et
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStage('input')} className="btn btn-sm">← Metne dön</button>
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-ink-3">
                  {okCount} hazır {warnCount > 0 && `· ${warnCount} hata`}
                </span>
                <button
                  onClick={() => saveMut.mutate()}
                  disabled={okCount === 0 || saveMut.isPending}
                  className="btn btn-primary"
                >
                  {saveMut.isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Check size={14} /> {okCount} Kaydı Ekle
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
