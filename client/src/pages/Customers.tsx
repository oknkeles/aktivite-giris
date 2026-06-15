import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Search, X, Loader2, Check } from 'lucide-react';
import { api, type Customer, type Contractor, type Activity } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { CURRENCIES, curSymbol } from '../lib/format';

type FormState = {
  name: string;
  contractorId: number;
  contact: string;
  phone: string;
  currency: string;
  active: boolean;
};

const EMPTY_FORM: FormState = { name: '', contractorId: 0, contact: '', phone: '', currency: 'TRY', active: true };

export default function Customers() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const qc = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  // modal: kapalı | { yeni } | { düzenle: müşteri }
  const [editing, setEditing] = useState<Customer | null | 'new'>(null);

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

  // Türkçe duyarsız arama (müşteri + yüklenici adı)
  const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
  const filtered = useMemo(() => {
    const q = trLower(search.trim());
    if (!q) return customers;
    return customers.filter(
      (c) => trLower(c.name).includes(q) || trLower(c.contractor.name).includes(q)
    );
  }, [customers, search]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="clabel">
            Müşteri Listesi
            <span className="text-ink-3 font-normal normal-case tracking-normal ml-1.5">
              {search ? `${filtered.length} / ${customers.length}` : `(${customers.length})`}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Arama */}
            <div className="relative flex-1 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input
                className="input !pl-9 !pr-8 !py-2 text-sm"
                placeholder="Müşteri veya yüklenici ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </div>
            {admin && (
              <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={() => setEditing('new')}>
                <Plus size={15} /> Yeni Müşteri
              </button>
            )}
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-4xl mb-3 animate-pulse-slow">👤</div>
            <div className="text-sm">Henüz müşteri eklenmedi</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-sm">"{search}" ile eşleşen müşteri yok</div>
          </div>
        ) : (
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_60px_110px_48px] gap-2 bg-paper-2 border-b border-paper-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Müşteri</span>
              <span className="hidden sm:block">Yüklenici</span>
              <span className="hidden sm:block">Birim</span>
              <span className="hidden sm:block">Fiyatlama</span>
              <span className="text-right">{admin ? '' : ''}</span>
            </div>
            {filtered.map((c) => {
              const ratedCount = c.rates.filter(r => r.rate > 0).length;
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-[1fr_140px_60px_110px_48px] gap-2 items-center px-4 py-2.5 border-b border-paper-3 last:border-0 hover:bg-paper transition text-sm ${c.active === false ? 'opacity-50' : ''}`}
                >
                  <div className="font-semibold truncate flex items-center gap-1.5">
                    {c.name}
                    {c.active === false && <span className="badge bg-ink/10 text-ink-2 flex-shrink-0">Pasif</span>}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                    <span className="badge bg-brand-indigo/15 text-brand-indigo truncate">{c.contractor.name}</span>
                    {c.contractor.discount > 0 && (
                      <span className="badge bg-brand-amber/15 text-[#B45309] flex-shrink-0">-%{c.contractor.discount}</span>
                    )}
                  </div>
                  <div className="hidden sm:block font-mono text-ink-2 font-semibold">{curSymbol(c.currency)}</div>
                  <div className={`hidden sm:block text-[11px] font-mono ${ratedCount === 0 ? 'text-brand-rose' : 'text-ink-3'}`}>
                    {ratedCount}/{activities.length} aktivite
                  </div>
                  <div className="flex justify-end">
                    {admin && (
                      <button onClick={() => setEditing(c)} className="text-brand-indigo hover:bg-brand-indigo/10 p-2 rounded-lg transition" title="Düzenle">
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing !== null && admin && (
        <CustomerModal
          customer={editing === 'new' ? null : editing}
          contractors={contractors}
          activities={activities}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['customers'] }); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Ekle/Düzenle modal'ı (tek form) ────────────────────────
function CustomerModal({
  customer, contractors, activities, onClose, onSaved,
}: {
  customer: Customer | null; // null = yeni
  contractors: Contractor[];
  activities: Activity[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !customer;

  const [form, setForm] = useState<FormState>(
    customer
      ? {
          name: customer.name,
          contractorId: customer.contractorId,
          contact: customer.contact || '',
          phone: customer.phone || '',
          currency: customer.currency || 'TRY',
          active: customer.active !== false,
        }
      : EMPTY_FORM
  );
  const [rates, setRates] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    activities.forEach((a) => {
      map[a.id] = customer?.rates.find((r) => r.activityId === a.id)?.rate || 0;
    });
    return map;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { ...form, rates: Object.fromEntries(Object.entries(rates)) };
      return isNew
        ? api.post('/customers', payload)
        : api.patch(`/customers/${customer!.id}`, payload);
    },
    onSuccess: () => {
      toast.show(isNew ? 'Müşteri eklendi' : 'Müşteri güncellendi');
      onSaved();
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const delMut = useMutation({
    mutationFn: () => api.delete(`/customers/${customer!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.show('Müşteri silindi');
      onClose();
    },
    onError: (e: any) => toast.show(e.message || 'Silinemedi', 'error'),
  });

  const sym = curSymbol(form.currency);
  const valid = form.name.trim() && form.contractorId > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isNew ? 'Yeni Müşteri' : <><strong>{customer!.name}</strong> <span className="text-ink-3 font-normal">düzenle</span></>}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          {/* Sol: silme (sadece düzenlemede) */}
          <div>
            {!isNew && (
              confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-ink-3">Emin misin?</span>
                  <button onClick={() => delMut.mutate()} disabled={delMut.isPending} className="btn btn-sm !bg-brand-rose !text-white">
                    {delMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Sil
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="btn btn-sm">Vazgeç</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-brand-rose hover:bg-brand-rose/10 p-2 rounded-lg transition" title="Müşteriyi sil">
                  <Trash2 size={15} />
                </button>
              )
            )}
          </div>
          {/* Sağ: kaydet */}
          <div className="flex items-center gap-2">
            <button className="btn" onClick={onClose}>İptal</button>
            <button className="btn btn-primary" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Kaydediliyor...</>
              ) : (
                <><Check size={14} /> {isNew ? 'Müşteri Ekle' : 'Güncelle'}</>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Müşteri adı</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. THY" />
          </div>
          <div>
            <label className="label">Yüklenici</label>
            <select className="input" value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: +e.target.value })}>
              <option value="0">— Seçin —</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.discount > 0 ? ` (-%${c.discount})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Yetkili</label>
            <input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </div>
          <div>
            <label className="label">Telefon</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Para Birimi</label>
            <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Durum</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, active: true })}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${form.active ? 'bg-brand-emerald/10 border-brand-emerald/40 text-brand-emerald' : 'bg-white border-paper-3 text-ink-3 hover:bg-paper-2'}`}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, active: false })}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${!form.active ? 'bg-ink/5 border-ink/30 text-ink' : 'bg-white border-paper-3 text-ink-3 hover:bg-paper-2'}`}
              >
                Pasif
              </button>
            </div>
          </div>
        </div>
        {!form.active && (
          <div className="text-[11px] text-ink-3 bg-paper-2 rounded-lg px-3 py-2 -mt-1">
            ℹ️ Pasif müşteri yeni kayıt eklerken listede çıkmaz; geçmiş kayıtlar ve raporlar korunur.
          </div>
        )}

        {activities.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="clabel">Aktivite Fiyatları</div>
              <div className="text-[10px] text-ink-3">{sym} · KDV hariç · 1 gün = 8 saat</div>
            </div>
            <div className="border border-paper-3 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_60px_140px] bg-paper-2 border-b border-paper-3 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                <span>Aktivite</span><span>Birim</span><span className="text-right">Günlük Ücret</span>
              </div>
              {activities.map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_60px_140px] px-3 py-2 border-b border-paper-3 last:border-0 items-center hover:bg-paper text-sm">
                  <div className="font-medium truncate">{a.name}</div>
                  <span className="tag !text-[10px]">{a.unit}</span>
                  <div className="flex border border-paper-3 rounded-lg overflow-hidden focus-within:border-brand-indigo focus-within:ring-4 focus-within:ring-brand-indigo/10">
                    <input
                      type="number"
                      className="w-full px-2 py-1 text-right font-mono text-xs outline-none"
                      value={rates[a.id] ?? 0}
                      onChange={(e) => setRates({ ...rates, [a.id]: +e.target.value })}
                    />
                    <span className="px-2 text-[10px] font-mono text-ink-3 bg-paper-2 border-l border-paper-3 flex items-center">{sym}/gün</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
