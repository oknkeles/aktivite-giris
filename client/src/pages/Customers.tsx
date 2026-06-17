import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Search, X, Loader2, Check, FolderPlus } from 'lucide-react';
import { api, type Customer, type Contractor, type Activity } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { CURRENCIES, curSymbol } from '../lib/format';

type FormState = { name: string; contractorId: number; contact: string; phone: string; currency: string; active: boolean };
const EMPTY_FORM: FormState = { name: '', contractorId: 0, contact: '', phone: '', currency: 'TRY', active: true };

// Modal içi düzenlenebilir proje
interface ProjForm {
  id?: number;
  name: string;
  active: boolean;
  rates: Record<number, number>; // activityId → rate
}

export default function Customers() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null | 'new'>(null);

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.get<Customer[]>('/customers') });
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors'], queryFn: () => api.get<Contractor[]>('/contractors') });
  const { data: activities = [] } = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });

  const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
  const filtered = useMemo(() => {
    const q = trLower(search.trim());
    if (!q) return customers;
    return customers.filter((c) => trLower(c.name).includes(q) || trLower(c.contractor.name).includes(q));
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
            <div className="relative flex-1 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input className="input !pl-9 !pr-8 !py-2 text-sm" placeholder="Müşteri veya yüklenici ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14} /></button>}
            </div>
            {admin && <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={() => setEditing('new')}><Plus size={15} /> Yeni Müşteri</button>}
          </div>
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-4xl mb-3 animate-pulse-slow">👤</div><div className="text-sm">Henüz müşteri eklenmedi</div></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-3xl mb-2">🔍</div><div className="text-sm">"{search}" ile eşleşen müşteri yok</div></div>
        ) : (
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_60px_120px_48px] gap-2 bg-paper-2 border-b border-paper-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Müşteri</span>
              <span className="hidden sm:block">Yüklenici</span>
              <span className="hidden sm:block">Birim</span>
              <span className="hidden sm:block">Projeler</span>
              <span></span>
            </div>
            {filtered.map((c) => {
              const activeProjects = c.projects?.filter((p) => p.active !== false) || [];
              return (
                <div key={c.id} className={`grid grid-cols-[1fr_140px_60px_120px_48px] gap-2 items-center px-4 py-2.5 border-b border-paper-3 last:border-0 hover:bg-paper transition text-sm ${c.active === false ? 'opacity-50' : ''}`}>
                  <div className="font-semibold truncate flex items-center gap-1.5">
                    {c.name}
                    {c.active === false && <span className="badge bg-ink/10 text-ink-2 flex-shrink-0">Pasif</span>}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                    <span className="badge bg-brand-indigo/15 text-brand-indigo truncate">{c.contractor.name}</span>
                    {c.contractor.discount > 0 && <span className="badge bg-brand-amber/15 text-[#B45309] flex-shrink-0">-%{c.contractor.discount}</span>}
                  </div>
                  <div className="hidden sm:block font-mono text-ink-2 font-semibold">{curSymbol(c.currency)}</div>
                  <div className="hidden sm:block text-[11px] font-mono text-ink-3 truncate">
                    {activeProjects.length} proje{activeProjects.length === 1 ? ` · ${activeProjects[0].name}` : ''}
                  </div>
                  <div className="flex justify-end">
                    {admin && <button onClick={() => setEditing(c)} className="text-brand-indigo hover:bg-brand-indigo/10 p-2 rounded-lg transition" title="Düzenle"><Pencil size={14} /></button>}
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
        />
      )}
    </div>
  );
}

function CustomerModal({ customer, contractors, activities, onClose }: {
  customer: Customer | null;
  contractors: Contractor[];
  activities: Activity[];
  onClose: () => void;
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

  // Projeler — mevcut müşterininkiler yüklenir; yeni müşteride bir boş proje
  const [projects, setProjects] = useState<ProjForm[]>(() => {
    if (customer && customer.projects?.length) {
      return customer.projects.map((p) => {
        const rates: Record<number, number> = {};
        activities.forEach((a) => { rates[a.id] = p.rates.find((r) => r.activityId === a.id)?.rate || 0; });
        return { id: p.id, name: p.name, active: p.active !== false, rates };
      });
    }
    const rates: Record<number, number> = {};
    activities.forEach((a) => { rates[a.id] = 0; });
    return [{ name: '', active: true, rates }];
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  function addProject() {
    const rates: Record<number, number> = {};
    activities.forEach((a) => { rates[a.id] = 0; });
    setProjects((arr) => [...arr, { name: '', active: true, rates }]);
  }
  function removeProject(idx: number) {
    setProjects((arr) => arr.filter((_, i) => i !== idx));
  }
  function setProject(idx: number, patch: Partial<ProjForm>) {
    setProjects((arr) => arr.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name.trim() || form.name, // boşsa müşteri adı
          active: p.active,
          rates: Object.fromEntries(Object.entries(p.rates)),
        })),
      };
      return isNew ? api.post('/customers', payload) : api.patch(`/customers/${customer!.id}`, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.show(isNew ? 'Müşteri eklendi' : 'Müşteri güncellendi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  const delMut = useMutation({
    mutationFn: () => api.delete(`/customers/${customer!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.show('Müşteri silindi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Silinemedi', 'error'),
  });

  const sym = curSymbol(form.currency);
  const valid = form.name.trim() && form.contractorId > 0 && projects.length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      busy={saveMut.isPending || delMut.isPending}
      busyLabel={delMut.isPending ? 'Siliniyor…' : 'Kaydediliyor…'}
      title={isNew ? 'Yeni Müşteri' : <><strong>{customer!.name}</strong> <span className="text-ink-3 font-normal">düzenle</span></>}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div>
            {!isNew && (confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-3">Emin misin?</span>
                <button onClick={() => delMut.mutate()} className="btn btn-sm !bg-brand-rose !text-white"><Trash2 size={13} /> Sil</button>
                <button onClick={() => setConfirmDelete(false)} className="btn btn-sm">Vazgeç</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-brand-rose hover:bg-brand-rose/10 p-2 rounded-lg transition" title="Müşteriyi sil"><Trash2 size={15} /></button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={onClose}>İptal</button>
            <button className="btn btn-primary" disabled={!valid} onClick={() => saveMut.mutate()}>
              <Check size={14} /> {isNew ? 'Müşteri Ekle' : 'Güncelle'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Müşteri bilgileri */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Müşteri adı</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. THY" /></div>
          <div><label className="label">Yüklenici</label>
            <select className="input" value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: +e.target.value })}>
              <option value="0">— Seçin —</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.discount > 0 ? ` (-%${c.discount})` : ''}</option>)}
            </select>
          </div>
          <div><label className="label">Yetkili</label><input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          <div><label className="label">Telefon</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Para Birimi</label>
            <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div><label className="label">Durum</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, active: true })} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${form.active ? 'bg-brand-emerald/10 border-brand-emerald/40 text-brand-emerald' : 'bg-surface border-paper-3 text-ink-3 hover:bg-paper-2'}`}>Aktif</button>
              <button type="button" onClick={() => setForm({ ...form, active: false })} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${!form.active ? 'bg-ink/5 border-ink/30 text-ink' : 'bg-surface border-paper-3 text-ink-3 hover:bg-paper-2'}`}>Pasif</button>
            </div>
          </div>
        </div>

        {/* Projeler */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="clabel">Projeler & Fiyatlar <span className="text-ink-3 font-normal normal-case tracking-normal">({sym} · gün başı)</span></div>
            <button onClick={addProject} className="btn btn-sm"><FolderPlus size={14} /> Proje Ekle</button>
          </div>
          <div className="text-[11px] text-ink-3 mb-3">
            Her projenin kendi fiyatı olabilir. Müşterinin tek projesi varsa kayıt eklerken otomatik seçilir; birden fazlaysa proje seçimi istenir.
          </div>

          <div className="space-y-3">
            {projects.map((p, idx) => (
              <div key={idx} className="border border-paper-3 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <input
                    className="input !py-1.5 text-sm font-semibold flex-1"
                    value={p.name}
                    onChange={(e) => setProject(idx, { name: e.target.value })}
                    placeholder={`Proje adı (boşsa "${form.name || 'müşteri adı'}")`}
                  />
                  {projects.length > 1 && (
                    <button onClick={() => removeProject(idx)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition flex-shrink-0" title="Projeyi çıkar"><Trash2 size={13} /></button>
                  )}
                </div>
                {activities.length > 0 && (
                  <div className="border border-paper-3 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_60px_130px] bg-paper-2 border-b border-paper-3 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
                      <span>Aktivite</span><span>Birim</span><span className="text-right">Günlük Ücret</span>
                    </div>
                    {activities.map((a) => (
                      <div key={a.id} className="grid grid-cols-[1fr_60px_130px] px-3 py-1.5 border-b border-paper-3 last:border-0 items-center text-sm">
                        <div className="font-medium truncate">{a.name}</div>
                        <span className="tag !text-[10px]">{a.unit}</span>
                        <div className="flex border border-paper-3 rounded-lg overflow-hidden focus-within:border-brand-indigo focus-within:ring-4 focus-within:ring-brand-indigo/10">
                          <input type="number" className="w-full px-2 py-1 text-right font-mono text-xs outline-none bg-transparent" value={p.rates[a.id] ?? 0} onChange={(e) => setProject(idx, { rates: { ...p.rates, [a.id]: +e.target.value } })} />
                          <span className="px-2 text-[10px] font-mono text-ink-3 bg-paper-2 border-l border-paper-3 flex items-center">{sym}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

