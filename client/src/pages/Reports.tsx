import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, BarChart3, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, type ReportData, type Customer } from '../api/client';
import { useToast } from '../components/Toast';
import { CountUp, Skeleton } from '../components/ui';
import { fmtHours, fmtMoney, curSymbol, fmtMoneyByCurrency } from '../lib/format';

export default function Reports() {
  const toast = useToast();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(yyyy, now.getMonth() + 1, 0).getDate();

  const [from, setFrom] = useState(`${yyyy}-${mm}-01`);
  const [to, setTo] = useState(`${yyyy}-${mm}-${String(last).padStart(2, '0')}`);
  const [cusId, setCusId] = useState('');

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });

  // Filtreler değişince otomatik fetch
  const { data: report, isFetching: reportFetching, refetch: refetchReport } = useQuery({
    queryKey: ['report', from, to, cusId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (cusId) params.set('customerId', cusId);
      return api.get<ReportData>(`/reports?${params.toString()}`);
    },
  });

  // Müşteri → aktivite grupla (her müşteri kendi para biriminde)
  const customerGroups: Record<string, any> = {};
  report?.entries.forEach((e) => {
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

  // Toplam tutar para birimine göre (karışık olabilir)
  const totalByCurrency: Record<string, number> = {};
  report?.entries.forEach((e) => {
    const c = e.currency || 'TRY';
    totalByCurrency[c] = (totalByCurrency[c] || 0) + e.net;
  });

  // Müşteriler saate göre azalan sıralı
  const groupList = Object.values(customerGroups).sort((a: any, b: any) => b.hours - a.hours);

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
    if (!report?.entries.length) return toast.show('Rapor boş', 'error');
    const wb = XLSX.utils.book_new();

    // Sheet 1: Detay — para birimi kolonu eklendi (müşteri bazında farklı olabilir)
    const detail: any[][] = [['Tarih', 'Müşteri', 'Aktivite', 'Talep ID', 'Açıklama', 'Saat', 'Gün', 'Tutar', 'Para Birimi']];
    report.entries.forEach(e => {
      detail.push([
        e.date, e.customerName, e.activityName,
        e.ticketId || '', e.note || '',
        +e.hours.toFixed(2), +e.days.toFixed(2),
        +e.net.toFixed(2), e.currency || 'TRY',
      ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(detail);
    ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
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
      <div className="card">
        <div className="clabel mb-4">Rapor Filtresi</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div><label className="label">Müşteri</label>
            <select className="input" value={cusId} onChange={(e) => setCusId(e.target.value)}>
              <option value="">Tümü</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Başlangıç</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">Bitiş</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn"
            onClick={() => refetchReport()}
            disabled={reportFetching}
            title="Verileri yeniden çek"
          >
            <BarChart3 size={15} className={reportFetching ? 'animate-spin' : ''} />
            {reportFetching ? 'Yükleniyor...' : 'Yenile'}
          </button>
          {report && report.count > 0 && (
            <button className="btn btn-success" onClick={exportExcel}><FileDown size={15} /> Excel'e Aktar</button>
          )}
          <span className="text-[11px] text-ink-3 ml-auto italic">
            💡 Filtreleri değiştirdiğinde rapor otomatik güncellenir
          </span>
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
            <MetricCard label="Toplam Saat" value={<CountUp value={report.totalHours} format={fmtHours} />} grad="grad-primary" />
            <MetricCard label="Kayıt Sayısı" value={<CountUp value={report.count} />} grad="" />
            <MetricCard label="Toplam Tutar" value={fmtMoneyByCurrency(totalByCurrency)} grad="grad-mint" />
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
                    <span className="text-[13px] font-mono font-bold text-ink min-w-[110px] text-right">{fmtMoney(cu.net)} {curSymbol(cu.currency)}</span>
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
                        <span className="font-mono font-semibold min-w-[110px] text-right">{fmtMoney(ag.net)} {curSymbol(cu.currency)}</span>
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
