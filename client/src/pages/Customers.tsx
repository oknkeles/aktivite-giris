import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, DollarSign, Search, X } from 'lucide-react';
import { api, type Customer, type Contractor, type Activity } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { fmtMoney } from '../lib/format';

export default function Customers() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', contractorId: 0, contact: '', phone: '' });
  const [rates, setRates] = useState<Record<number, number>>({});
  const [editing, setEditing] = useState<Customer | null>(null);
  const [editRates, setEditRates] = useState<Record<number, number>>({});
  const [search, setSearch] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
  });
  const { data: contractors = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => api.get<Contractor[]>('/contractors'),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
  });

  const addMut = useMutation({
    mutationFn: () => api.post('/customers', { ...form, rates: Object.fromEntries(Object.entries(rates)) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setForm({ name:'', contractorId: 0, contact:'', phone:'' });
      setRates({});
      toast.show('Müşteri eklendi');
    },
    onError: (e: any) => toast.show(e.message, 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.show('Silindi'); },
  });

  const updRatesMut = useMutation({
    mutationFn: () => api.patch(`/customers/${editing!.id}`, { rates: Object.fromEntries(Object.entries(editRates)) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setEditing(null); toast.show('Fiyatlar güncellendi'); },
  });

  function openEdit(c: Customer) {
    const map: Record<number, number> = {};
    activities.forEach((a) => {
      const r = c.rates.find((x) => x.activityId === a.id);
      map[a.id] = r?.rate || 0;
    });
    setEditRates(map);
    setEditing(c);
  }

  // Türkçe duyarsız arama (İ/i, ı/I sorunsuz) — müşteri adı + yüklenici adında arar
  const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
  const filtered = useMemo(() => {
    const q = trLower(search.trim());
    if (!q) return customers;
    return customers.filter(
      (c) => trLower(c.name).includes(q) || trLower(c.contractor.name).includes(q)
    );
  }, [customers, search]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-5 animate-fade-in">
      {admin && (
        <div className="card h-fit">
          <div className="clabel mb-4">Yeni Müşteri</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Müşteri adı</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. THY" /></div>
            <div><label className="label">Yüklenici</label>
              <select className="input" value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: +e.target.value })}>
                <option value="0">— Seçin —</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}{c.discount > 0 ? ` (-%${c.discount})` : ''}</option>)}
              </select>
            </div>
            <div><label className="label">Yetkili</label><input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            <div><label className="label">Telefon</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          {activities.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="clabel">Aktivite Fiyatları</div>
                <div className="text-[10px] text-ink-3">KDV hariç · 1 gün = 8 saat</div>
              </div>
              <div className="border border-paper-3 rounded-xl overflow-hidden mb-3">
                <div className="grid grid-cols-[1fr_60px_140px] bg-paper-2 border-b border-paper-3 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                  <span>Aktivite</span><span>Birim</span><span className="text-right">Günlük Ücret</span>
                </div>
                {activities.map((a) => (
                  <div key={a.id} className="grid grid-cols-[1fr_60px_140px] px-3 py-2 border-b border-paper-3 last:border-0 items-center hover:bg-paper text-sm">
                    <div className="font-medium truncate">{a.name}</div>
                    <span className="tag !text-[10px]">{a.unit}</span>
                    <div className="flex border border-paper-3 rounded-lg overflow-hidden focus-within:border-brand-indigo focus-within:ring-4 focus-within:ring-brand-indigo/10">
                      <input type="number" className="w-full px-2 py-1 text-right font-mono text-xs outline-none" value={rates[a.id] || 0} onChange={(e) => setRates({ ...rates, [a.id]: +e.target.value })} />
                      <span className="px-2 text-[10px] font-mono text-ink-3 bg-paper-2 border-l border-paper-3 flex items-center">₺/gün</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-primary w-full" disabled={!form.name || !form.contractorId || addMut.isPending} onClick={() => addMut.mutate()}>
            <Plus size={16} /> Müşteri Ekle
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="clabel">
            Müşteri Listesi
            <span className="text-ink-3 font-normal normal-case tracking-normal ml-1.5">
              {search ? `${filtered.length} / ${customers.length}` : `(${customers.length})`}
            </span>
          </div>
          {/* Arama */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
            <input
              className="input !pl-9 !pr-8 !py-2 text-sm"
              placeholder="Müşteri veya yüklenici ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-4xl mb-3 animate-pulse-slow">👤</div>
            <div className="text-sm">Henüz eklenmedi</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-sm">"{search}" ile eşleşen müşteri yok</div>
          </div>
        ) : (
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            {/* Liste başlığı */}
            <div className="grid grid-cols-[1fr_140px_110px_80px] gap-2 bg-paper-2 border-b border-paper-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Müşteri</span>
              <span className="hidden sm:block">Yüklenici</span>
              <span className="hidden sm:block">Fiyatlama</span>
              <span className="text-right">{admin ? 'İşlem' : ''}</span>
            </div>
            {filtered.map((c) => {
              const ratedCount = c.rates.filter(r => r.rate > 0).length;
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_140px_110px_80px] gap-2 items-center px-4 py-2.5 border-b border-paper-3 last:border-0 hover:bg-paper transition text-sm"
                >
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                    <span className="badge bg-brand-indigo/15 text-brand-indigo truncate">{c.contractor.name}</span>
                    {c.contractor.discount > 0 && (
                      <span className="badge bg-brand-amber/15 text-[#B45309] flex-shrink-0">-%{c.contractor.discount}</span>
                    )}
                  </div>
                  <div className={`hidden sm:block text-[11px] font-mono ${ratedCount === 0 ? 'text-brand-rose' : 'text-ink-3'}`}>
                    {ratedCount}/{activities.length} aktivite
                  </div>
                  <div className="flex justify-end gap-1">
                    {admin && (
                      <>
                        <button onClick={() => openEdit(c)} className="text-brand-emerald hover:bg-brand-emerald/10 p-1.5 rounded-lg transition" title="Fiyat güncelle"><DollarSign size={13} /></button>
                        <button onClick={() => delMut.mutate(c.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition" title="Sil"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} size="md"
          title={<><strong>{editing.name}</strong> <span className="text-ink-3 font-normal">— {editing.contractor.name}</span></>}
          footer={<><button className="btn" onClick={() => setEditing(null)}>İptal</button><button className="btn btn-primary" onClick={() => updRatesMut.mutate()}>Kaydet</button></>}>
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_60px_140px] bg-paper-2 border-b border-paper-3 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Aktivite</span><span>Birim</span><span className="text-right">Günlük Ücret</span>
            </div>
            {activities.map((a) => (
              <div key={a.id} className="grid grid-cols-[1fr_60px_140px] px-3 py-2 border-b border-paper-3 last:border-0 items-center">
                <div className="font-medium truncate">{a.name}</div>
                <span className="tag !text-[10px]">{a.unit}</span>
                <div className="flex border border-paper-3 rounded-lg overflow-hidden focus-within:border-brand-indigo focus-within:ring-4 focus-within:ring-brand-indigo/10">
                  <input type="number" className="w-full px-2 py-1 text-right font-mono text-xs outline-none" value={editRates[a.id] ?? 0} onChange={(e) => setEditRates({ ...editRates, [a.id]: +e.target.value })} />
                  <span className="px-2 text-[10px] font-mono text-ink-3 bg-paper-2 border-l border-paper-3 flex items-center">₺/gün</span>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
