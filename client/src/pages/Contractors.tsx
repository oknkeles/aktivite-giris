import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { api, type Contractor } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

export default function Contractors() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '', address: '', discount: 0 });
  const [editing, setEditing] = useState<Contractor | null>(null);

  const { data: list = [] } = useQuery({
    queryKey: ['contractors'],
    queryFn: () => api.get<Contractor[]>('/contractors'),
  });

  const addMut = useMutation({
    mutationFn: () => api.post('/contractors', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractors'] }); setForm({ name:'', contact:'', phone:'', email:'', address:'', discount:0 }); toast.show('Yüklenici eklendi'); },
    onError: (e: any) => toast.show(e.message, 'error'),
  });
  const updMut = useMutation({
    mutationFn: (c: Contractor) => api.patch(`/contractors/${c.id}`, c),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractors'] }); setEditing(null); toast.show('Güncellendi'); },
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/contractors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contractors'] }); toast.show('Silindi'); },
    onError: (e: any) => toast.show(e.message, 'error'),
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 animate-fade-in">
      {admin && (
        <div className="card h-fit">
          <div className="clabel mb-4">Yeni Yüklenici</div>
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
          <button className="btn btn-primary w-full mt-4" disabled={!form.name || addMut.isPending} onClick={() => addMut.mutate()}>
            <Plus size={16} /> Yüklenici Ekle
          </button>
        </div>
      )}

      <div className="card">
        <div className="clabel mb-4">Yüklenici Listesi ({list.length})</div>
        {list.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-4xl mb-3 animate-pulse-slow">🏢</div>
            <div className="text-sm">Henüz eklenmedi</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((c) => (
              <div key={c.id} className="border border-paper-3 rounded-xl p-4 hover:border-brand-violet/30 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="font-extrabold text-base truncate">{c.name}</div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {c.discount > 0 && <span className="badge bg-brand-amber/15 text-[#B45309]">-%{c.discount}</span>}
                    <span className="badge bg-brand-sky/15 text-brand-sky">{c._count?.customers ?? 0} müşteri</span>
                  </div>
                </div>
                {(c.contact || c.phone || c.email) && (
                  <div className="text-[12px] text-ink-3 truncate">
                    {[c.contact, c.phone, c.email].filter(Boolean).join(' · ')}
                  </div>
                )}
                {admin && (
                  <div className="mt-3 flex justify-end gap-1.5">
                    <button onClick={() => setEditing(c)} className="text-ink-2 hover:bg-paper-2 p-1.5 rounded-lg transition"><Pencil size={13} /></button>
                    <button onClick={() => delMut.mutate(c.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Yüklenici Düzenle" size="md"
          footer={<><button className="btn" onClick={() => setEditing(null)}>İptal</button><button className="btn btn-primary" onClick={() => updMut.mutate(editing)}>Kaydet</button></>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="label">Şirket adı</label><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><label className="label">Yetkili</label><input className="input" value={editing.contact || ''} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></div>
            <div><label className="label">Telefon</label><input className="input" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">İskonto (%)</label><input type="number" className="input font-mono" value={editing.discount} onChange={(e) => setEditing({ ...editing, discount: +e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
