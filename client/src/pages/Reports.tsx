import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileDown, BarChart3, FileText, X, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import clsx from 'clsx';
import { api, type ReportData, type Customer, type Contractor } from '../api/client';
import { useToast } from '../components/Toast';
import { CountUp, Skeleton } from '../components/ui';
import { fmtHours, curSymbol, maskMoney, maskMoneyByCurrency } from '../lib/format';
import { usePrivacy } from '../store/privacy';

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

export default function Reports() {
  const toast = useToast();
  const masked = usePrivacy((s) => s.masked);
  const [searchParams] = useSearchParams();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(yyyy, now.getMonth() + 1, 0).getDate();

  const [from, setFrom] = useState(`${yyyy}-${mm}-01`);
  const [to, setTo] = useState(`${yyyy}-${mm}-${String(last).padStart(2, '0')}`);
  // Çoklu seçim: yüklenici + müşteri
  const [selContractors, setSelContractors] = useState<Set<number>>(new Set());
  const [selCustomers, setSelCustomers] = useState<Set<number>>(() => {
    const p = searchParams.get('customerId');
    return p ? new Set([Number(p)]) : new Set();
  });
  const [custSearch, setCustSearch] = useState('');

  useEffect(() => {
    const p = searchParams.get('customerId');
    if (p) setSelCustomers(new Set([Number(p)]));
  }, [searchParams]);

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors'], queryFn: () => api.get<Contractor[]>('/contractors') });

  // Tarih aralığı için tüm kayıtlar; yüklenici/müşteri filtresi client-side
  const { data: report, isFetching: reportFetching, refetch: refetchReport } = useQuery({
    queryKey: ['report', from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<ReportData>(`/reports?${params.toString()}`);
    },
  });

  // Çoklu filtre (yüklenici VE müşteri — ikisi de boşsa hepsi)
  const filtered = useMemo(
    () => (report?.entries || []).filter((e) =>
      (selContractors.size === 0 || selContractors.has(e.contractorId)) &&
      (selCustomers.size === 0 || selCustomers.has(e.customerId))
    ),
    [report, selContractors, selCustomers]
  );

  // Müşteri → aktivite grupla (her müşteri kendi para biriminde)
  const customerGroups: Record<string, any> = {};
  filtered.forEach((e) => {
    const key = e.customerName;
    if (!customerGroups[key]) {
      customerGroups[key] = { name: key, id: e.customerId, currency: e.currency || 'TRY', acts: {}, net: 0, hours: 0 };
    }
    const cu = customerGroups[key];
    const ag = cu.acts[e.activityName] = cu.acts[e.activityName] || { name: e.activityName, hours: 0, days: 0, net: 0 };
    ag.hours += e.hours;
    ag.days += e.days;
    ag.net += e.net;
    cu.net += e.net;
    cu.hours += e.hours;
  });

  const totalByCurrency: Record<string, number> = {};
  filtered.forEach((e) => { const c = e.currency || 'TRY'; totalByCurrency[c] = (totalByCurrency[c] || 0) + e.net; });
  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
  const groupList = Object.values(customerGroups).sort((a: any, b: any) => b.hours - a.hours);

  // Müşteri çipleri — seçili yüklenicilere ve aramaya göre daralt
  const chipCustomers = useMemo(() => {
    const q = trLower(custSearch.trim());
    return customers.filter((c) =>
      (selContractors.size === 0 || selContractors.has(c.contractorId)) &&
      (!q || trLower(c.name).includes(q))
    );
  }, [customers, selContractors, custSearch]);

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) {
    setter((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function downloadPdf(customerId: number, customerName: string) {
    const token = localStorage.getItem('aktivite_token') || '';
    const params = new URLSearchParams();
    params.set('customerId', String(customerId));
    params.set('from', from);
    params.set('to', to);
    // Period etiketi (örn. "Mayıs 2026")
    const d = new Date(from + 'T00:00:00');
    const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    params.set('period', `${monthNames[d.getMonth()]} ${d.getFullYear()}`);

    // PDF stream — auth header ile fetch, blob → indir
    const apiBase = ((): string => {
      // api.ts'teki gibi: dev'de Vite proxy, prod'da same-origin
      return '/api';
    })();

    fetch(`${apiBase}/reports/pdf?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          // Sunucudan gelen JSON hata mesajını çıkar
          let msg = `PDF üretilemedi (HTTP ${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {}
          throw new Error(msg);
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapor_${customerName.replace(/\s+/g, '_')}_${from}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.show(`📄 PDF indirildi: ${customerName}`);
      })
      .catch((err) => toast.show(err.message || 'PDF hatası', 'error'));
  }

  function exportExcel() {
    if (!filtered.length) return toast.show('Rapor boş', 'error');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Detay — para birimi kolonu eklendi (müşteri bazında farklı olabilir)
    const detail: any[][] = [['Tarih', 'Müşteri', 'Yüklenici', 'Aktivite', 'Talep ID', 'Açıklama', 'Saat', 'Gün', 'Tutar', 'Para Birimi']];
    filtered.forEach(e => {
      detail.push([
        e.date, e.customerName, e.contractorName, e.activityName,
        e.ticketId || '', e.note || '',
        +e.hours.toFixed(2), +e.days.toFixed(2),
        +e.net.toFixed(2), e.currency || 'TRY',
      ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(detail);
    ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detay');

    // Sheet 2: Müşteri × Aktivite özeti
    const summary: any[][] = [['Müşteri', 'Aktivite', 'Saat', 'Gün', 'Tutar', 'Para Birimi']];
    Object.values(customerGroups).forEach((cu: any) => {
      Object.values(cu.acts).forEach((ag: any) => {
        summary.push([cu.name, ag.name, +ag.hours.toFixed(2), +ag.days.toFixed(2), +ag.net.toFixed(2), cu.currency]);
      });
    });
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Özet');

    XLSX.writeFile(wb, `rapor_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="clabel">Rapor Filtresi</div>
          {(selContractors.size > 0 || selCustomers.size > 0) && (
            <button
              onClick={() => { setSelContractors(new Set()); setSelCustomers(new Set()); setCustSearch(''); }}
              className="text-[11px] font-semibold text-ink-3 hover:text-ink flex items-center gap-1"
            >
              <X size={12} /> Filtreleri temizle
            </button>
          )}
        </div>

        {/* Yüklenici — çoklu seçim */}
        <div>
          <label className="label">Yüklenici {selContractors.size > 0 && <span className="text-brand-indigo">({selContractors.size})</span>}</label>
          <div className="flex flex-wrap gap-1.5">
            {contractors.map((c) => {
              const on = selContractors.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleSet(setSelContractors, c.id)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition',
                    on ? 'bg-brand-indigo/10 border-brand-indigo/40 text-brand-indigo'
                       : 'bg-paper-2 border-paper-3 text-ink-3 hover:text-ink hover:border-ink-3/40'
                  )}
                >
                  {c.name}
                </button>
              );
            })}
            {contractors.length === 0 && <span className="text-[12px] text-ink-3">Yüklenici yok</span>}
          </div>
        </div>

        {/* Müşteri — çoklu seçim (seçili yükleniciye ve aramaya göre daralır) */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="label !mb-0">Müşteri {selCustomers.size > 0 && <span className="text-brand-indigo">({selCustomers.size})</span>}</label>
            <div className="relative w-44">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                placeholder="Müşteri ara…"
                className="input !py-1.5 !pl-8 !text-[12.5px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
            {chipCustomers.map((c) => {
              const on = selCustomers.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleSet(setSelCustomers, c.id)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[12px] font-medium border transition',
                    on ? 'bg-brand-indigo/10 border-brand-indigo/40 text-brand-indigo'
                       : 'bg-paper-2 border-paper-3 text-ink-3 hover:text-ink hover:border-ink-3/40'
                  )}
                >
                  {c.name}
                </button>
              );
            })}
            {chipCustomers.length === 0 && <span className="text-[12px] text-ink-3 px-1 py-1">Eşleşen müşteri yok</span>}
          </div>
        </div>

        {/* Tarih + aksiyon */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div><label className="label">Başlangıç</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">Bitiş</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn" onClick={() => refetchReport()} disabled={reportFetching} title="Verileri yeniden çek">
            <BarChart3 size={15} className={reportFetching ? 'animate-spin' : ''} />
            {reportFetching ? 'Yükleniyor...' : 'Yenile'}
          </button>
          <button className="btn btn-success" onClick={exportExcel} disabled={!filtered.length}>
            <FileDown size={15} /> Excel'e Aktar
          </button>
        </div>
      </div>

      {!report && reportFetching && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card !p-4 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-28" /></div>
            ))}
          </div>
          <div className="card space-y-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </>
      )}

      {report && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Toplam Saat" value={<CountUp value={totalHours} format={fmtHours} />} grad="grad-primary" />
            <MetricCard label="Kayıt Sayısı" value={<CountUp value={filtered.length} />} grad="" />
            <MetricCard label="Toplam Tutar" value={maskMoneyByCurrency(totalByCurrency, masked)} grad="grad-mint" />
          </div>

          {groupList.length === 0 ? (
            <div className="card text-center py-12 text-ink-3">
              <div className="text-4xl mb-3 animate-pulse-slow">📊</div>
              <div className="text-sm">Bu dönemde kayıt bulunamadı</div>
            </div>
          ) : (
            /* Müşteri bazlı temiz liste — saate göre sıralı, alt toplam ayrımlı */
            <div className="card !p-0 overflow-hidden divide-y divide-paper-3">
              {groupList.map((cu: any) => (
                <div key={cu.name}>
                  {/* Müşteri başlığı (alt toplam) */}
                  <div className="flex items-center gap-3 px-4 sm:px-5 py-3 bg-paper-2/60">
                    <span className="font-extrabold text-ink truncate flex-1">{cu.name}</span>
                    <span className="text-[12px] font-mono text-ink-3">{fmtHours(cu.hours)}</span>
                    <span className="text-[13px] font-mono font-bold text-ink min-w-[110px] text-right">{maskMoney(cu.net, cu.currency, masked)}</span>
                    <button
                      onClick={() => downloadPdf(cu.id, cu.name)}
                      className="text-brand-indigo hover:bg-brand-indigo/10 px-2 py-1 rounded-md transition flex items-center gap-1 text-[11px] font-semibold border border-brand-indigo/30 flex-shrink-0"
                      title={`${cu.name} için PDF rapor`}
                    >
                      <FileText size={12} /> PDF
                    </button>
                  </div>
                  {/* Aktivite satırları — saate göre sıralı */}
                  {Object.values(cu.acts)
                    .sort((a: any, b: any) => b.hours - a.hours)
                    .map((ag: any) => (
                      <div key={ag.name} className="flex items-center gap-3 pl-7 sm:pl-9 pr-4 sm:pr-5 py-2 border-t border-paper-2 text-sm hover:bg-paper">
                        <span className="text-ink-2 flex-1 truncate">{ag.name}</span>
                        <span className="tag hidden sm:inline-block">{ag.days.toFixed(2)} gün</span>
                        <span className="text-[12px] font-mono text-ink-3">{fmtHours(ag.hours)}</span>
                        <span className="font-mono font-semibold min-w-[110px] text-right">{maskMoney(ag.net, cu.currency, masked)}</span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, grad }: { label: string; value: React.ReactNode; grad: string }) {
  return (
    <div className="card !p-4">
      <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-2xl font-extrabold font-mono ${grad === 'grad-primary' ? 'grad-text' : grad === 'grad-mint' ? 'grad-text-mint' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
