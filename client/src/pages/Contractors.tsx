import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Loader2, Check, Search, X } from 'lucide-react';
import { api, type Contractor } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

type FormState = { name: string; contact: string; phone: string; email: string; address: string; discount: number };
const EMPTY: FormState = { name: '', contact: '', phone: '', email: '', address: '', discount: 0 };

export default function Contractors() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contractor | null | 'new'>(null);

  const { data: list = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => api.get<Contractor[]>('/contractors'),
  });

  const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
  const filtered = useMemo(() => {
    const q = trLower(search.trim());
    if (!q) return list;
    return list.filter((c) => trLower(c.name).includes(q) || trLower(c.contact || '').includes(q));
  }, [list, search]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="clabel">
            Yüklenici Listesi
            <span className="text-ink-3 font-normal normal-case tracking-normal ml-1.5">
              {search ? `${filtered.length} / ${list.length}` : `(${list.length})`}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input className="input !pl-9 !pr-8 !py-2 text-sm" placeholder="Yüklenici ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14} /></button>}
            </div>
            {admin && <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={() => setEditing('new')}><Plus size={15} /> Yeni Yüklenici</button>}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-4xl mb-3 animate-pulse-slow">🏢</div><div className="text-sm">Henüz yüklenici eklenmedi</div></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-3xl mb-2">🔍</div><div className="text-sm">"{search}" ile eşleşen yok</div></div>
        ) : (
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_160px_90px_70px_48px] gap-2 bg-paper-2 border-b border-paper-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Yüklenici</span>
              <span className="hidden sm:block">İletişim</span>
              <span className="hidden sm:block text-center">Müşteri</span>
              <span className="hidden sm:block text-right">İskonto</span>
              <span></span>
            </div>
            {filtered.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_160px_90px_70px_48px] gap-2 items-center px-4 py-2.5 border-b border-paper-3 last:border-0 hover:bg-paper transition text-sm">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="hidden sm:block text-[12px] text-ink-3 truncate">{[c.contact, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                <div className="hidden sm:flex justify-center"><span className="badge bg-brand-sky/15 text-brand-sky">{c._count?.customers ?? 0}</span></div>
                <div className="hidden sm:block text-right font-mono text-[12px]">{c.discount > 0 ? <span className="text-[#B45309] font-bold">-%{c.discount}</span> : <span className="text-ink-3">—</span>}</div>
                <div className="flex justify-end">
                  {admin && <button onClick={() => setEditing(c)} className="text-brand-indigo hover:bg-brand-indigo/10 p-2 rounded-lg transition" title="Düzenle"><Pencil size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== null && admin && (
        <ContractorModal contractor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ContractorModal({ contractor, onClose }: { contractor: Contractor | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !contractor;
  const [form, setForm] = useState<FormState>(
    contractor
      ? { name: contractor.name, contact: contractor.contact || '', phone: contractor.phone || '', email: contractor.email || '', address: contractor.address || '', discount: contractor.discount }
      : EMPTY
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => (isNew ? api.post('/contractors', form) : api.patch(`/contractors/${contractor!.id}`, form)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractors'] }); toast.show(isNew ? 'Yüklenici eklendi' : 'Güncellendi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });
  const delMut = useMutation({
    mutationFn: () => api.delete(`/contractors/${contractor!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractors'] }); toast.show('Silindi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Silinemedi', 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isNew ? 'Yeni Yüklenici' : <><strong>{contractor!.name}</strong> <span className="text-ink-3 font-normal">düzenle</span></>}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div>
            {!isNew && (confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-3">Emin misin?</span>
                <button onClick={() => delMut.mutate()} disabled={delMut.isPending} className="btn btn-sm !bg-brand-rose !text-white">{delMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Sil</button>
                <button onClick={() => setConfirmDelete(false)} className="btn btn-sm">Vazgeç</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-brand-rose hover:bg-brand-rose/10 p-2 rounded-lg transition" title="Sil"><Trash2 size={15} /></button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={onClose}>İptal</button>
            <button className="btn btn-primary" disabled={!form.name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Kaydediliyor...</> : <><Check size={14} /> {isNew ? 'Ekle' : 'Güncelle'}</>}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className="label">Şirket adı</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. SALDO" /></div>
        <div><label className="label">Yetkili kişi</label><input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
        <div><label className="label">Telefon</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">E-posta</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">Adres</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="sm:col-span-2">
          <label className="label">İskonto (%)</label>
          <input type="number" className="input font-mono" value={form.discount} onChange={(e) => setForm({ ...form, discount: +e.target.value })} min="0" max="100" step="0.1" />
          <div className="text-[11px] text-ink-3 mt-1">Örn: %10 girilirse 15.000 ₺ → 13.500 ₺</div>
        </div>
      </div>
    </Modal>
  );
}
