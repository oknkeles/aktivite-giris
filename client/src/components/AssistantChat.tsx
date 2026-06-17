// AI Asistan — sağdan açılan sohbet çekmecesi. Doğal dille kayıt ekle/güncelle/
// sil/listele, boş iş günlerini toplu doldur (önizleme + onay), rapor sorusu.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, X, Send, Loader2, Check, CalendarRange } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';
import { useAssistant } from '../store/assistant';
import { useToast } from './Toast';

interface FillData { entries: any[]; meta: { customerName: string; activityName: string; qty: number; count: number } }
interface Msg { role: 'user' | 'bot'; text: string; fill?: FillData; done?: boolean }

const SUGGESTIONS = [
  'bugün 8 saat Aktek dashboard',
  'bu hafta kaç saat girdim',
  'bu ayın boş günlerini THY 8 saat destek ile doldur',
  'son kaydımı sil',
];

export default function AssistantChat() {
  const open = useAssistant((s) => s.open);
  const setOpen = useAssistant((s) => s.setOpen);
  const qc = useQueryClient();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, sending]);

  function refreshData() {
    qc.invalidateQueries({ queryKey: ['entries'] });
    qc.invalidateQueries({ queryKey: ['entries-all'] });
    qc.invalidateQueries({ queryKey: ['team-entries'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['report'] });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    const next = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(next);
    setInput('');
    setSending(true);
    try {
      const history = next.slice(-10).map((m) => ({ role: m.role, body: m.text }));
      const res = await api.post<any>('/assistant', { message: q, history });
      if (res.kind === 'fill_preview') {
        setMsgs((m) => [...m, { role: 'bot', text: res.reply, fill: { entries: res.entries, meta: res.meta } }]);
      } else {
        setMsgs((m) => [...m, { role: 'bot', text: res.reply }]);
        if (res.refresh) refreshData();
      }
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'bot', text: '❌ ' + (e.message || 'Hata oluştu') }]);
    } finally {
      setSending(false);
    }
  }

  async function confirmFill(idx: number) {
    const msg = msgs[idx];
    if (!msg.fill) return;
    setSending(true);
    try {
      const r = await api.post<{ created: number }>('/entries/bulk-create', { entries: msg.fill.entries });
      setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, done: true } : x)));
      setMsgs((m) => [...m, { role: 'bot', text: `✅ ${r.created} kayıt eklendi.` }]);
      refreshData();
      toast.show(`🎉 ${r.created} kayıt eklendi`);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'bot', text: '❌ ' + (e.message || 'Eklenemedi') }]);
    } finally {
      setSending(false);
    }
  }

  function cancelFill(idx: number) {
    setMsgs((m) => m.map((x, i) => (i === idx ? { ...x, done: true } : x)));
    setMsgs((m) => [...m, { role: 'bot', text: 'İptal edildi.' }]);
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/30 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
      <div className="fixed top-0 right-0 bottom-0 z-[150] w-full sm:w-[400px] bg-surface border-l border-paper-3 flex flex-col shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-paper-3 bg-grad-primary text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={17} />
            <div>
              <div className="font-extrabold text-[15px] leading-tight">AI Asistan</div>
              <div className="text-[10.5px] text-white/70">Yaz, gerisini ben halledeyim</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"><X size={18} /></button>
        </div>

        {/* Mesajlar */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 && (
            <div className="space-y-3">
              <div className="text-[13px] text-ink-2 leading-relaxed">
                Merhaba 👋 Doğal dille yazabilirsin:
                <ul className="mt-2 space-y-1 text-ink-3 text-[12.5px]">
                  <li>• <b className="text-ink-2">Ekle:</b> "bugün 8 saat Aktek dashboard"</li>
                  <li>• <b className="text-ink-2">Güncelle/Sil:</b> "dünkü Aktek'i 4 saate çevir"</li>
                  <li>• <b className="text-ink-2">Doldur:</b> "bu ayın boş günlerini THY 8 saat doldur"</li>
                  <li>• <b className="text-ink-2">Rapor:</b> "geçen ay Beymen kaç gün"</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="text-[11px] bg-paper-2 hover:bg-paper-3/60 border border-paper-3 rounded-full px-2.5 py-1 text-ink-2 transition">{s}</button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={clsx(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] whitespace-pre-wrap leading-relaxed',
                m.role === 'user' ? 'bg-brand-indigo text-white rounded-br-sm' : 'bg-paper-2 text-ink rounded-bl-sm'
              )}>
                {m.text}
                {/* Fill önizleme onay kutusu */}
                {m.fill && !m.done && (
                  <div className="mt-2.5 bg-surface border border-paper-3 rounded-xl p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-3 mb-2">
                      <CalendarRange size={13} /> {m.fill.meta.count} iş günü · {m.fill.meta.customerName} · {m.fill.meta.qty}s
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => confirmFill(i)} disabled={sending} className="btn btn-primary btn-sm flex-1"><Check size={13} /> Onayla ({m.fill.meta.count})</button>
                      <button onClick={() => cancelFill(i)} className="btn btn-sm">İptal</button>
                    </div>
                  </div>
                )}
                {m.fill && m.done && <div className="mt-1.5 text-[11px] text-ink-3 italic">— işlendi</div>}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-paper-2 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                <Loader2 size={16} className="animate-spin text-ink-3" />
              </div>
            </div>
          )}
        </div>

        {/* Giriş */}
        <div className="border-t border-paper-3 p-3 flex-shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bir şey yaz…"
              className="input !py-2.5 flex-1"
            />
            <button type="submit" disabled={!input.trim() || sending} className="btn btn-primary !px-3 !py-2.5"><Send size={16} /></button>
          </form>
        </div>
      </div>
    </>
  );
}
