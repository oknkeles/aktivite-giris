import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, BarChart3, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api, type ReportData, type Customer, type Contractor } from '../api/client';
import { useToast } from '../components/Toast';
import { fmtHours, fmtMoney } from '../lib/format';

export default function Reports() {
  const toast = useToast();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(yyyy, now.getMonth() + 1, 0).getDate();

  const [from, setFrom] = useState(`${yyyy}-${mm}-01`);
  const [to, setTo] = useState(`${yyyy}-${mm}-${String(last).padStart(2, '0')}`);
  const [conId, setConId] = useState('');
  const [cusId, setCusId] = useState('');
  const [run, setRun] = useState(true);

  const { data: contractors = [] } = useQuery({ queryKey: ['contractors'], queryFn: () => api.get<Contractor[]>('/contractors') });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });

  const { data: report } = useQuery({
    queryKey: ['report', from, to, conId, cusId, run],
    enabled: run,
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (conId) params.set('contractorId', conId);
      if (cusId) params.set('customerId', cusId);
      return api.get<ReportData>(`/reports?${params.toString()}`);
    },
  });

  // Group entries by contractor → customer → activity
  const grouped: Record<string, any> = {};
  report?.entries.forEach((e) => {
    const ck = e.contractorName;
    if (!grouped[ck]) grouped[ck] = { name: ck, disc: e.discount, customers: {}, totalGross: 0, totalNet: 0, totalHours: 0 };
    const cu = grouped[ck].customers[e.customerName] = grouped[ck].customers[e.customerName] || { name: e.customerName, id: e.customerId, acts: {}, gross: 0, net: 0, hours: 0 };
    const ag = cu.acts[e.activityName] = cu.acts[e.activityName] || { name: e.activityName, hours: 0, days: 0, gross: 0, net: 0 };
    ag.hours += e.hours; ag.days += e.days; ag.gross += e.gross; ag.net += e.net;
    cu.gross += e.gross; cu.net += e.net; cu.hours += e.hours;
    grouped[ck].totalGross += e.gross; grouped[ck].totalNet += e.net; grouped[ck].totalHours += e.hours;
  });

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
      .then((res) => {
        if (!res.ok) throw new Error('PDF üretilemedi');
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

    // Sheet 1: Detay
    const detail: any[][] = [['Tarih', 'Yüklenici', 'Müşteri', 'Aktivite', 'Talep ID', 'Açıklama', 'Saat', 'Gün', 'Brüt (₺)', 'İskonto (%)', 'Net (₺)']];
    report.entries.forEach(e => {
      detail.push([
        e.date, e.contractorName, e.customerName, e.activityName,
        e.ticketId || '', e.note || '',
        +e.hours.toFixed(2), +e.days.toFixed(2),
        +e.gross.toFixed(2), e.discount, +e.net.toFixed(2),
      ]);
    });
    detail.push(['', '', '', 'TOPLAM', '', '', +report.totalHours.toFixed(2), +(report.totalHours / 8).toFixed(2), +report.totalGross.toFixed(2), '', +report.totalNet.toFixed(2)]);
    const ws1 = XLSX.utils.aoa_to_sheet(detail);
    ws1['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detay');

    // Sheet 2: Grup özet
    const summary: any[][] = [['Yüklenici', 'Müşteri', 'Aktivite', 'Saat', 'Gün', 'Brüt (₺)', 'İskonto (%)', 'Net (₺)']];
    Object.values(grouped).forEach((con: any) => {
      Object.values(con.customers).forEach((cu: any) => {
        Object.values(cu.acts).forEach((ag: any) => {
          summary.push([con.name, cu.name, ag.name, +ag.hours.toFixed(2), +ag.days.toFixed(2), +ag.gross.toFixed(2), con.disc, +ag.net.toFixed(2)]);
        });
      });
    });
    summary.push(['', '', 'TOPLAM', +report.totalHours.toFixed(2), +(report.totalHours / 8).toFixed(2), +report.totalGross.toFixed(2), '', +report.totalNet.toFixed(2)]);
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Özet');

    XLSX.writeFile(wb, `rapor_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card">
        <div className="clabel mb-4">Rapor Filtresi</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div><label className="label">Yüklenici</label>
            <select className="input" value={conId} onChange={(e) => setConId(e.target.value)}>
              <option value="">Tümü</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Müşteri</label>
            <select className="input" value={cusId} onChange={(e) => setCusId(e.target.value)}>
              <option value="">Tümü</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Başlangıç</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label">Bitiş</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setRun(r => !r)}><BarChart3 size={15} /> Raporu Oluştur</button>
          {report && report.count > 0 && (
            <button className="btn btn-success" onClick={exportExcel}><FileDown size={15} /> Excel'e Aktar</button>
          )}
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Toplam Saat" value={fmtHours(report.totalHours)} grad="grad-primary" />
            <MetricCard label="Kayıt Sayısı" value={String(report.count)} grad="" />
            <MetricCard label="Brüt Tutar" value={`${fmtMoney(report.totalGross)} ₺`} grad="grad-warm" />
            <MetricCard label="Net Tutar" value={`${fmtMoney(report.totalNet)} ₺`} grad="grad-mint" />
          </div>

          {Object.values(grouped).length === 0 && (
            <div className="card text-center py-12 text-ink-3">
              <div className="text-4xl mb-3 animate-pulse-slow">📊</div>
              <div className="text-sm">Bu dönemde kayıt bulunamadı</div>
            </div>
          )}

          {Object.values(grouped).map((con: any) => (
            <div key={con.name} className="bg-white border border-paper-3 rounded-2xl overflow-hidden shadow-soft">
              <div className="bg-ink text-white px-5 py-3 flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Yüklenici</span>
                  <span className="font-extrabold">{con.name}</span>
                  {con.disc > 0 && <span className="badge bg-brand-amber/20 text-brand-amber">-%{con.disc}</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-white/70">{fmtHours(con.totalHours)}</span>
                  {con.disc > 0 && <span className="text-xs font-mono text-white/40 line-through">{fmtMoney(con.totalGross)} ₺</span>}
                  <span className="font-mono font-bold grad-text-mint">{fmtMoney(con.totalNet)} ₺</span>
                </div>
              </div>
              {Object.values(con.customers).map((cu: any) => (
                <div key={cu.name}>
                  <div className="flex justify-between items-center px-5 py-2.5 bg-paper border-b border-paper-3">
                    <span className="font-bold text-sm">👤 {cu.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-ink-3">{fmtHours(cu.hours)}</span>
                      <span className="font-mono font-bold text-brand-emerald">{fmtMoney(cu.net)} ₺</span>
                      <button
                        onClick={() => downloadPdf(cu.id, cu.name)}
                        className="text-brand-indigo hover:bg-brand-indigo/10 p-1.5 rounded-lg transition flex items-center gap-1 text-[11px] font-semibold"
                        title={`${cu.name} için PDF rapor`}
                      >
                        <FileText size={12} /> PDF
                      </button>
                    </div>
                  </div>
                  {Object.values(cu.acts).map((ag: any) => (
                    <div key={ag.name} className="flex items-center justify-between px-7 py-2.5 border-b border-paper-3 last:border-b-0 text-sm hover:bg-paper">
                      <span className="text-ink-2 flex-1">{ag.name}</span>
                      <span className="tag mr-3 hidden sm:inline-block">{ag.days.toFixed(2)} gün</span>
                      <span className="tag mr-3">{fmtHours(ag.hours)}</span>
                      {con.disc > 0 && <span className="text-xs font-mono text-ink-3 line-through mr-3 min-w-20 text-right hidden sm:inline">{fmtMoney(ag.gross)} ₺</span>}
                      <span className="font-mono font-bold min-w-24 text-right">{fmtMoney(ag.net)} ₺</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, grad }: { label: string; value: string; grad: string }) {
  return (
    <div className="card !p-4">
      <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-2xl font-extrabold font-mono ${grad === 'grad-primary' ? 'grad-text' : grad === 'grad-mint' ? 'grad-text-mint' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
