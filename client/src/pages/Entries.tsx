import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileDown, Trash2, Edit3, X, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import clsx from 'clsx';
import { api, type Entry, type Customer, type User, type Activity } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import { fmtHours, qtyToHours, MONTHS } from '../lib/format';

function entryHours(e: Entry) { return qtyToHours(e.qty, e.activity.unit); }

export default function Entries() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const admin = isAdmin(me);

  const [cusFilter, setCusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  // Admin için kullanıcı filtresi: '' (kendi) | 'all' (hepsi) | userId string
  const [userFilter, setUserFilter] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  const { data: entries = [], isLoading: entriesLoading, isFetching: entriesFetching } = useQuery({
    queryKey: ['entries-all', userFilter],
    queryFn: () => {
      const qs = userFilter ? `?userId=${encodeURIComponent(userFilter)}` : '';
      return api.get<Entry[]>(`/entries${qs}`);
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    enabled: admin, // Sadece admin için fetch
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      setConfirmDeleteId(null);
      toast.show('Kayıt silindi');
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  // Bulk delete — sıralı çalışır, idempotent (her seferinde yenisi)
  const bulkDelMut = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.delete(`/entries/${id}`))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { ok: ids.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      setSelectedIds(new Set());
      setBulkConfirmDelete(false);
      toast.show(failed ? `${ok} silindi, ${failed} başarısız` : `${ok} kayıt silindi`);
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  // Bulk update — seçili tüm entry'leri tek tek günceller
  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, patch }: { ids: number[]; patch: any }) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.put(`/entries/${id}`, patch))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { ok: ids.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ['entries-all'] });
      setSelectedIds(new Set());
      setBulkEditOpen(false);
      toast.show(failed ? `${ok} güncellendi, ${failed} başarısız` : `${ok} kayıt güncellendi`);
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (cusFilter && String(e.customerId) !== cusFilter) return false;
      if (monthFilter && !e.date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [entries, cusFilter, monthFilter]);

  const months = useMemo(() => {
    const set = new Set(entries.map(e => e.date.substring(0, 7)));
    return [...set].sort().reverse();
  }, [entries]);

  function exportExcel() {
    if (!filtered.length) return toast.show('Aktarılacak kayıt yok', 'error');
    // Aktivite listesi sadece saat bilgisini içerir — tutarlar Raporlar export'unda
    const rows: any[][] = [['Tarih', 'Müşteri', 'Yüklenici', 'Aktivite', 'Talep ID', 'Süre (Saat)', 'Not', 'Giren']];
    filtered.forEach((e) => {
      rows.push([
        e.date, e.customer.name, e.customer.contractor.name,
        e.activity.name, e.ticketId || '', +entryHours(e).toFixed(2),
        e.note || '', e.user.fullname
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aktiviteler');
    XLSX.writeFile(wb, `aktiviteler_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <span className="clabel">Aktivite Kayıtları</span>
            {entriesFetching && !entriesLoading && (
              <span className="text-[10px] text-ink-3 animate-pulse">yükleniyor…</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {admin && (
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="input !w-auto !py-1.5 text-xs border-brand-indigo/40"
                title="Yönetici: kullanıcı filtresi"
              >
                <option value="">👤 Sadece benim</option>
                <option value="all">🌐 Tüm kullanıcılar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    👤 {u.fullname}
                  </option>
                ))}
              </select>
            )}
            <select value={cusFilter} onChange={(e) => setCusFilter(e.target.value)} className="input !w-auto !py-1.5 text-xs">
              <option value="">Tüm müşteriler</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="input !w-auto !py-1.5 text-xs">
              <option value="">Tüm zamanlar</option>
              {months.map(m => {
                const [y, mo] = m.split('-');
                return <option key={m} value={m}>{MONTHS[+mo - 1]} {y}</option>;
              })}
            </select>
            <button className="btn btn-success btn-sm" onClick={exportExcel}>
              <FileDown size={14} /> Excel
            </button>
          </div>
        </div>

        {/* Bulk selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-xl bg-brand-indigo text-white animate-fade-in flex-wrap">
            <span className="bg-white/20 px-2 py-0.5 rounded font-mono font-bold text-xs">
              {selectedIds.size}
            </span>
            <span className="text-sm font-medium flex-1">kayıt seçili</span>
            <button
              className="bg-white/15 rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-white/25 transition flex items-center gap-1"
              onClick={() => setSelectedIds(new Set())}
            >
              <X size={11} /> Temizle
            </button>
            <button
              className="bg-white/15 rounded-md px-3 py-1 text-xs font-bold hover:bg-white/25 transition flex items-center gap-1"
              onClick={() => setBulkEditOpen(true)}
            >
              <Edit3 size={12} /> Toplu Düzenle
            </button>
            {bulkConfirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => bulkDelMut.mutate(Array.from(selectedIds))}
                  disabled={bulkDelMut.isPending}
                  className="bg-white text-brand-rose rounded-md px-3 py-1 text-xs font-bold hover:bg-paper-2 transition"
                >
                  {bulkDelMut.isPending ? 'Siliniyor...' : 'Evet, Sil'}
                </button>
                <button
                  onClick={() => setBulkConfirmDelete(false)}
                  className="bg-white/15 rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/25 transition"
                >
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                onClick={() => setBulkConfirmDelete(true)}
                className="bg-brand-rose rounded-md px-3 py-1 text-xs font-bold hover:bg-brand-rose/90 transition flex items-center gap-1"
              >
                <Trash2 size={12} /> Toplu Sil
              </button>
            )}
          </div>
        )}

        {entriesLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-paper-2 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-4xl mb-3 animate-pulse-slow">📄</div>
            <div className="text-sm">Kayıt bulunamadı</div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-sm min-w-[940px]">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3 border-b-2 border-paper-3">
                  <th className="text-left px-5 sm:px-6 py-3 w-[36px]">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id))}
                      ref={(el) => {
                        if (el) {
                          const someSelected = filtered.some((e) => selectedIds.has(e.id));
                          const allSelected = filtered.every((e) => selectedIds.has(e.id));
                          el.indeterminate = someSelected && !allSelected;
                        }
                      }}
                      onChange={(ev) => {
                        if (ev.target.checked) {
                          setSelectedIds(new Set(filtered.map((e) => e.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      className="w-4 h-4 accent-brand-indigo cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-3">Tarih</th>
                  <th className="text-left py-3">Müşteri</th>
                  <th className="text-left py-3">Aktivite</th>
                  <th className="text-left py-3">Talep ID</th>
                  <th className="text-left py-3">Açıklama</th>
                  <th className="text-right py-3">Saat</th>
                  <th className="text-right py-3">Giren</th>
                  <th className="px-5 sm:px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-3">
                {filtered.map((e) => {
                  const d = new Date(e.date + 'T00:00:00');
                  const isSelected = selectedIds.has(e.id);
                  return (
                    <tr key={e.id} className={clsx('hover:bg-paper transition-colors', isSelected && 'bg-brand-indigo/5')}>
                      <td className="px-5 sm:px-6 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(ev) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (ev.target.checked) next.add(e.id);
                              else next.delete(e.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 accent-brand-indigo cursor-pointer"
                        />
                      </td>
                      <td className="py-3 font-mono text-[11px] text-ink-3 whitespace-nowrap">
                        {d.getDate()} {MONTHS[d.getMonth()].substring(0, 3)} {d.getFullYear()}
                      </td>
                      <td className="py-3 font-semibold">{e.customer.name}</td>
                      <td className="py-3 text-ink-2">{e.activity.name}</td>
                      <td className="py-3">
                        {e.ticketId ? (
                          <span className="badge bg-brand-violet/15 text-brand-violet font-mono !text-[10.5px]">
                            🎫 {e.ticketId}
                          </span>
                        ) : <span className="text-ink-4 text-[11px]">—</span>}
                      </td>
                      <td className="py-3 text-[11.5px] text-ink-3 max-w-[280px]">
                        {e.note ? (
                          <span className="line-clamp-2 whitespace-pre-wrap" title={e.note}>{e.note}</span>
                        ) : <span className="text-ink-4">—</span>}
                      </td>
                      <td className="py-3 text-right"><span className="tag font-bold">{fmtHours(entryHours(e))}</span></td>
                      <td className="py-3 text-right text-[11px] text-ink-3">{e.user.fullname}</td>
                      <td className="px-5 sm:px-6 py-3 text-right">
                        {confirmDeleteId === e.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => delMut.mutate(e.id)}
                              className="text-[11px] font-bold bg-brand-rose text-white px-2.5 py-1 rounded-lg hover:bg-brand-rose/90"
                            >
                              Sil
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] font-semibold text-ink-2 px-2 py-1 rounded-lg hover:bg-paper-2"
                            >
                              Vazgeç
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(e.id)}
                            className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition"
                            title="Sil"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Edit Modal */}
      {bulkEditOpen && (
        <BulkEditModal
          count={selectedIds.size}
          customers={customers}
          activities={activities}
          onClose={() => setBulkEditOpen(false)}
          onApply={(patch) =>
            bulkUpdateMut.mutate({ ids: Array.from(selectedIds), patch })
          }
          loading={bulkUpdateMut.isPending}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
function BulkEditModal({
  count,
  customers,
  activities,
  onClose,
  onApply,
  loading,
}: {
  count: number;
  customers: Customer[];
  activities: Activity[];
  onClose: () => void;
  onApply: (patch: any) => void;
  loading: boolean;
}) {
  const [customerId, setCustomerId] = useState<string>('');
  const [activityId, setActivityId] = useState<string>('');
  const [ticketId, setTicketId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [updateCustomer, setUpdateCustomer] = useState(false);
  const [updateActivity, setUpdateActivity] = useState(false);
  const [updateTicket, setUpdateTicket] = useState(false);
  const [updateNote, setUpdateNote] = useState(false);

  // ESC ile kapat (backdrop tıklaması kapatmaz)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function apply() {
    const patch: any = {};
    if (updateCustomer && customerId) patch.customerId = +customerId;
    if (updateActivity && activityId) patch.activityId = +activityId;
    if (updateTicket) patch.ticketId = ticketId.trim() || null;
    if (updateNote) patch.note = note.trim() || null;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onApply(patch);
  }

  const anySelected = updateCustomer || updateActivity || updateTicket || updateNote;

  return (
    <div className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-paper-3 flex items-center justify-between">
          <div>
            <div className="font-extrabold text-base">Toplu Düzenle</div>
            <div className="text-[11px] text-ink-3">{count} kayıt güncellenecek</div>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink p-1 rounded-lg hover:bg-paper-2">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="text-[11.5px] text-ink-3 bg-paper-2 rounded-lg p-2.5">
            💡 Sadece <strong>işaretlediğin alanlar</strong> güncellenir. İşaretsiz alanlar değişmez.
          </div>

          <div className={clsx('p-3 rounded-xl border transition', updateCustomer ? 'bg-brand-indigo/5 border-brand-indigo/30' : 'border-paper-3')}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={updateCustomer}
                onChange={(e) => setUpdateCustomer(e.target.checked)}
                className="w-4 h-4 accent-brand-indigo"
              />
              <span className="text-sm font-semibold">Müşteri değiştir</span>
            </label>
            {updateCustomer && (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="input mt-2"
              >
                <option value="">— Müşteri seç —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          <div className={clsx('p-3 rounded-xl border transition', updateActivity ? 'bg-brand-indigo/5 border-brand-indigo/30' : 'border-paper-3')}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={updateActivity}
                onChange={(e) => setUpdateActivity(e.target.checked)}
                className="w-4 h-4 accent-brand-indigo"
              />
              <span className="text-sm font-semibold">Aktivite değiştir</span>
            </label>
            {updateActivity && (
              <select
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                className="input mt-2"
              >
                <option value="">— Aktivite seç —</option>
                {activities.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
              </select>
            )}
          </div>

          <div className={clsx('p-3 rounded-xl border transition', updateTicket ? 'bg-brand-indigo/5 border-brand-indigo/30' : 'border-paper-3')}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={updateTicket}
                onChange={(e) => setUpdateTicket(e.target.checked)}
                className="w-4 h-4 accent-brand-indigo"
              />
              <span className="text-sm font-semibold">Talep ID güncelle (boş bırakırsan temizler)</span>
            </label>
            {updateTicket && (
              <input
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="JIRA-1234"
                className="input mt-2 font-mono"
              />
            )}
          </div>

          <div className={clsx('p-3 rounded-xl border transition', updateNote ? 'bg-brand-indigo/5 border-brand-indigo/30' : 'border-paper-3')}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={updateNote}
                onChange={(e) => setUpdateNote(e.target.checked)}
                className="w-4 h-4 accent-brand-indigo"
              />
              <span className="text-sm font-semibold">Açıklama güncelle (boş bırakırsan temizler)</span>
            </label>
            {updateNote && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="input mt-2 resize-y"
                placeholder="Yeni açıklama..."
              />
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-paper-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn">İptal</button>
          <button
            onClick={apply}
            disabled={!anySelected || loading}
            className="btn btn-primary"
          >
            {loading ? `Güncelleniyor...` : `${count} Kaydı Güncelle`}
          </button>
        </div>
      </div>
    </div>
  );
}
