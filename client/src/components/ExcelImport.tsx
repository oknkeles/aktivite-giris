// Excel İçe Aktarma — sadece admin. Dış sistemden alınan Excel'deki satırları
// Ad Soyad eşleşmesiyle ilgili kullanıcının kaydı olarak içeri alır.
// Akış: dosya seç → satırlar parse + eşleştirilir → önizleme (düzeltilebilir) → içe aktar.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, X, Check, AlertTriangle, Trash2, Loader2, Upload } from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import { api, type Customer, type Activity, type User } from '../api/client';
import { useToast } from './Toast';

interface ImportRow {
  ok: boolean;
  warning?: string;
  userName: string;   // Excel'deki ham Ad Soyad
  userId?: number;
  rawDate: string;
  date?: string;      // YYYY-MM-DD
  customerName: string; // Excel'deki ham müşteri adı
  customerId?: number;
  qty?: number;
  ticketId?: string | null;
  note?: string | null;
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

// "05.01.2026" / "5.1.2026" / "2026-01-05" / Excel seri numarası → YYYY-MM-DD
function parseExcelDate(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel seri tarihi (1900 epoch)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

function parseQty(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isFinite(n) && n > 0 ? n : undefined;
}

export default function ExcelImport({
  open, onClose, users, customers, activities,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  customers: Customer[];
  activities: Activity[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [activityId, setActivityId] = useState<number>(0);

  function handleClose() {
    setRows([]);
    setFileName('');
    onClose();
  }

  // ESC ile kapat (backdrop tıklaması kapatmaz)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function matchUser(name: string): number | undefined {
    const q = trLower(name);
    return users.find((u) => trLower(u.fullname) === q)?.id
      ?? users.find((u) => trLower(u.fullname).includes(q) || q.includes(trLower(u.fullname)))?.id;
  }

  function matchCustomer(name: string): number | undefined {
    const q = trLower(name);
    return customers.find((c) => trLower(c.name) === q)?.id
      ?? customers.find((c) => trLower(c.name).includes(q) || q.includes(trLower(c.name)))?.id;
  }

  function validate(r: ImportRow): ImportRow {
    const problems: string[] = [];
    if (!r.userId) problems.push('kullanıcı eşleşmedi');
    if (!r.date) problems.push('tarih okunamadı');
    if (!r.customerId) problems.push('müşteri eşleşmedi');
    if (!r.qty) problems.push('saat okunamadı');
    return { ...r, ok: problems.length === 0, warning: problems.join(', ') || undefined };
  }

  async function handleFile(f: File) {
    setFileName(f.name);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

      // Başlık satırını bul — "Ad Soyad" ve "Tarih" kolonlarını içeren satır
      const headerIdx = grid.findIndex((row) => {
        const cells = row.map((c) => trLower(String(c)));
        return cells.includes('ad soyad') && cells.includes('tarih');
      });
      if (headerIdx === -1) {
        toast.show('Başlık satırı bulunamadı — "Ad Soyad" ve "Tarih" kolonları gerekli', 'error');
        return;
      }
      const headers = grid[headerIdx].map((c) => trLower(String(c)));
      const col = (name: string) => headers.indexOf(name);
      const ci = {
        user: col('ad soyad'),
        date: col('tarih'),
        customer: col('müşteri'),
        qty: col('aktivite saati'),
        ticket: col('ticket id'),
        note: col('açıklama'),
      };

      const parsed: ImportRow[] = [];
      for (const row of grid.slice(headerIdx + 1)) {
        const userName = String(row[ci.user] ?? '').trim();
        const rawDate = String(row[ci.date] ?? '').trim();
        // Bölüm başlığı/boş satırları atla (örn. "Web", "ABAP" satırları)
        if (!userName || (!rawDate && row[ci.date] === '')) continue;

        const customerName = String(row[ci.customer] ?? '').trim();
        parsed.push(validate({
          ok: false,
          userName,
          userId: matchUser(userName),
          rawDate: rawDate || String(row[ci.date]),
          date: parseExcelDate(row[ci.date]),
          customerName,
          customerId: matchCustomer(customerName),
          qty: parseQty(row[ci.qty]),
          ticketId: ci.ticket >= 0 ? String(row[ci.ticket] ?? '').trim() || null : null,
          note: ci.note >= 0 ? String(row[ci.note] ?? '').trim() || null : null,
        }));
      }

      if (!parsed.length) {
        toast.show('Aktarılabilir satır bulunamadı', 'error');
        return;
      }
      setRows(parsed);
    } catch (err: any) {
      toast.show('Dosya okunamadı: ' + (err.message || 'bilinmeyen hata'), 'error');
    }
  }

  function updateRow(idx: number, patch: Partial<ImportRow>) {
    setRows((arr) => arr.map((r, i) => (i === idx ? validate({ ...r, ...patch }) : r)));
  }

  const importMut = useMutation({
    mutationFn: () => {
      const valid = rows
        .filter((r) => r.ok)
        .map((r) => ({
          userId: r.userId!,
          date: r.date!,
          qty: r.qty!,
          customerId: r.customerId!,
          activityId,
          ticketId: r.ticketId || null,
          note: r.note || null,
        }));
      return api.post<{ created: number }>('/entries/import', { entries: valid });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.show(`🎉 ${data.created} kayıt içe aktarıldı!`);
      handleClose();
    },
    onError: (e: any) => toast.show(e.message || 'İçe aktarma hatası', 'error'),
  });

  if (!open) return null;

  const okCount = rows.filter((r) => r.ok).length;
  const warnCount = rows.length - okCount;

  return (
    <div className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-grad-primary text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <FileUp size={18} />
            <div>
              <div className="font-extrabold text-base leading-tight">Excel İçe Aktar</div>
              <div className="text-[11px] text-white/75">
                {rows.length === 0
                  ? 'Dış sistem Excel\'ini yükle — Ad Soyad ile kullanıcı eşleştirilir'
                  : `${fileName} · ${okCount} hazır${warnCount > 0 ? ` · ${warnCount} sorunlu` : ''}`}
              </div>
            </div>
          </div>
          <button onClick={handleClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* DOSYA SEÇİMİ */}
        {rows.length === 0 && (
          <div className="px-5 py-8 flex-1 overflow-y-auto">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-paper-3 hover:border-brand-indigo/50 rounded-2xl py-14 flex flex-col items-center gap-3 text-ink-3 hover:text-brand-indigo transition"
            >
              <Upload size={32} />
              <div className="text-sm font-semibold">Excel dosyası seç (.xlsx / .xls / .csv)</div>
              <div className="text-[11px]">Beklenen kolonlar: Ad Soyad · Tarih · Müşteri · Aktivite Saati · Ticket ID · Açıklama</div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <div className="text-[11px] text-ink-3 bg-paper-2 rounded-lg p-3 mt-5 space-y-1">
              <div>💡 <strong>Nasıl çalışır:</strong></div>
              <div>• "Ad Soyad" kolonu sistemdeki kullanıcılarla eşleştirilir — kayıt o kişinin adına yazılır</div>
              <div>• "Müşteri" kolonu sistemdeki müşterilerle eşleştirilir (büyük/küçük harf önemsiz)</div>
              <div>• Eşleşmeyen satırları önizlemede elle düzeltebilirsin, kaydetmeden önce hepsini görürsün</div>
            </div>
          </div>
        )}

        {/* ÖNİZLEME */}
        {rows.length > 0 && (
          <div className="px-5 py-4 flex-1 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="text-[11.5px] text-ink-3 flex-1">
                {rows.length} satır okundu. Sorunlu satırları düzelt veya kaldır.
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-ink-3 uppercase">Aktivite Türü:</span>
                <select
                  value={activityId}
                  onChange={(e) => setActivityId(+e.target.value)}
                  className="input !w-auto !py-1.5 text-xs"
                >
                  <option value={0}>— Seçin —</option>
                  {activities.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
                </select>
              </div>
            </div>

            <div className="border border-paper-3 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[20px_150px_95px_1fr_70px_1fr_28px] gap-2 bg-paper-2 border-b border-paper-3 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                <span></span><span>Kullanıcı</span><span>Tarih</span><span>Müşteri</span><span>Saat</span><span>Açıklama</span><span></span>
              </div>
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={clsx(
                    'grid grid-cols-[20px_150px_95px_1fr_70px_1fr_28px] gap-2 items-center px-3 py-2 border-b border-paper-3 last:border-0 text-xs',
                    !r.ok && 'bg-brand-amber/5'
                  )}
                >
                  <span className={r.ok ? 'text-brand-emerald' : 'text-brand-amber'}>
                    {r.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
                  </span>
                  {r.userId ? (
                    <span className="font-semibold truncate">{users.find((u) => u.id === r.userId)?.fullname}</span>
                  ) : (
                    <select
                      value={r.userId || ''}
                      onChange={(e) => updateRow(i, { userId: e.target.value ? +e.target.value : undefined })}
                      className="input !py-1 !text-[11px] border-brand-amber/50"
                      title={`Excel: ${r.userName}`}
                    >
                      <option value="">{r.userName} ?</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.fullname}</option>)}
                    </select>
                  )}
                  <span className={clsx('font-mono', !r.date && 'text-brand-rose')}>{r.date || r.rawDate}</span>
                  {r.customerId ? (
                    <span className="truncate">{customers.find((c) => c.id === r.customerId)?.name}</span>
                  ) : (
                    <select
                      value={r.customerId || ''}
                      onChange={(e) => updateRow(i, { customerId: e.target.value ? +e.target.value : undefined })}
                      className="input !py-1 !text-[11px] border-brand-amber/50"
                      title={`Excel: ${r.customerName}`}
                    >
                      <option value="">{r.customerName || '—'} ?</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <span className={clsx('font-mono', !r.qty && 'text-brand-rose')}>{r.qty ?? '—'}</span>
                  <span className="text-ink-3 truncate" title={r.note || ''}>
                    {r.ticketId ? `[${r.ticketId}] ` : ''}{r.note || '—'}
                  </span>
                  <button
                    onClick={() => setRows((arr) => arr.filter((_, j) => j !== i))}
                    className="text-ink-3 hover:text-brand-rose p-1 rounded hover:bg-paper-2"
                    title="Satırı kaldır"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-paper-3 bg-paper-2/40 flex items-center justify-between gap-2 flex-shrink-0">
          {rows.length === 0 ? (
            <button onClick={handleClose} className="btn ml-auto">Kapat</button>
          ) : (
            <>
              <button onClick={() => { setRows([]); setFileName(''); }} className="btn btn-sm">← Başka dosya</button>
              <div className="flex items-center gap-2">
                {!activityId && <span className="text-[11px] text-brand-amber font-semibold">⚠ Aktivite türü seç</span>}
                <button
                  onClick={() => importMut.mutate()}
                  disabled={okCount === 0 || !activityId || importMut.isPending}
                  className="btn btn-primary"
                >
                  {importMut.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Aktarılıyor...</>
                  ) : (
                    <><Check size={14} /> {okCount} Kaydı İçe Aktar</>
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
