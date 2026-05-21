import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileDown, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, type Entry, type Customer } from '../api/client';
import { useToast } from '../components/Toast';
import { fmtHours, qtyToHours, MONTHS } from '../lib/format';

function entryHours(e: Entry) { return qtyToHours(e.qty, e.activity.unit); }

export default function Entries() {
  const toast = useToast();
  const qc = useQueryClient();

  const [cusFilter, setCusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: entries = [] } = useQuery({
    queryKey: ['entries-all'],
    queryFn: () => api.get<Entry[]>('/entries'),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
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
          <span className="clabel">Aktivite Kayıtları</span>
          <div className="flex flex-wrap gap-2">
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

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-4xl mb-3 animate-pulse-slow">📄</div>
            <div className="text-sm">Kayıt bulunamadı</div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:-mx-6">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-ink-3 border-b-2 border-paper-3">
                  <th className="text-left px-5 sm:px-6 py-3">Tarih</th>
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
                  return (
                    <tr key={e.id} className="hover:bg-paper transition-colors">
                      <td className="px-5 sm:px-6 py-3 font-mono text-[11px] text-ink-3 whitespace-nowrap">
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
    </div>
  );
}
