import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Loader2, Check, Search, X } from 'lucide-react';
import { api, type Activity } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

type FormState = { name: string; unit: string; desc: string; active: boolean };
const EMPTY: FormState = { name: '', unit: 'saat', desc: '', active: true };

export default function Activities() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Activity | null | 'new'>(null);

  const { data: list = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
  });

  const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
  const filtered = useMemo(() => {
    const q = trLower(search.trim());
    if (!q) return list;
    return list.filter((a) => trLower(a.name).includes(q));
  }, [list, search]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="clabel">
            Aktivite Türleri
            <span className="text-ink-3 font-normal normal-case tracking-normal ml-1.5">
              {search ? `${filtered.length} / ${list.length}` : `(${list.length})`}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input className="input !pl-9 !pr-8 !py-2 text-sm" placeholder="Aktivite ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14} /></button>}
            </div>
            {admin && <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={() => setEditing('new')}><Plus size={15} /> Yeni Aktivite</button>}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-4xl mb-3 animate-pulse-slow">📋</div><div className="text-sm">Henüz aktivite türü eklenmedi</div></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-3xl mb-2">🔍</div><div className="text-sm">"{search}" ile eşleşen yok</div></div>
        ) : (
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_1fr_48px] gap-2 bg-paper-2 border-b border-paper-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Aktivite</span>
              <span>Birim</span>
              <span className="hidden sm:block">Açıklama</span>
              <span></span>
            </div>
            {filtered.map((a) => (
              <div key={a.id} className={`grid grid-cols-[1fr_70px_1fr_48px] gap-2 items-center px-4 py-2.5 border-b border-paper-3 last:border-0 hover:bg-paper transition text-sm ${a.active === false ? 'opacity-50' : ''}`}>
                <div className="font-semibold truncate flex items-center gap-1.5">
                  {a.name}
                  {a.active === false && <span className="badge bg-ink/10 text-ink-2 flex-shrink-0">Pasif</span>}
                </div>
                <div><span className="tag !text-[10px]">{a.unit}</span></div>
                <div className="hidden sm:block text-[12px] text-ink-3 truncate">{a.desc || '—'}</div>
                <div className="flex justify-end">
                  {admin && <button onClick={() => setEditing(a)} className="text-brand-indigo hover:bg-brand-indigo/10 p-2 rounded-lg transition" title="Düzenle"><Pencil size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== null && admin && (
        <ActivityModal activity={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ActivityModal({ activity, onClose }: { activity: Activity | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !activity;
  const [form, setForm] = useState<FormState>(
    activity ? { name: activity.name, unit: activity.unit, desc: activity.desc || '', active: activity.active !== false } : EMPTY
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => (isNew ? api.post('/activities', form) : api.patch(`/activities/${activity!.id}`, form)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); toast.show(isNew ? 'Aktivite eklendi' : 'Güncellendi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });
  const delMut = useMutation({
    mutationFn: () => api.delete(`/activities/${activity!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); toast.show('Silindi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Silinemedi', 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isNew ? 'Yeni Aktivite Türü' : <><strong>{activity!.name}</strong> <span className="text-ink-3 font-normal">düzenle</span></>}
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
      <div className="space-y-3">
        <div>
          <label className="label">Aktivite Adı</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. Senior Danışman" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Birim</label>
            <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option value="saat">Saat</option>
              <option value="gün">Gün</option>
              <option value="adet">Adet</option>
            </select>
          </div>
          <div>
            <label className="label">Durum</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm({ ...form, active: true })} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${form.active ? 'bg-brand-emerald/10 border-brand-emerald/40 text-brand-emerald' : 'bg-surface border-paper-3 text-ink-3 hover:bg-paper-2'}`}>Aktif</button>
              <button type="button" onClick={() => setForm({ ...form, active: false })} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition ${!form.active ? 'bg-ink/5 border-ink/30 text-ink' : 'bg-surface border-paper-3 text-ink-3 hover:bg-paper-2'}`}>Pasif</button>
            </div>
          </div>
        </div>
        <div>
          <label className="label">Açıklama</label>
          <textarea className="input min-h-20" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Kapsam, koşullar..." />
        </div>
        {!form.active && (
          <div className="text-[11px] text-ink-3 bg-paper-2 rounded-lg px-3 py-2">
            ℹ️ Pasif aktivite yeni kayıt eklerken listede çıkmaz; geçmiş kayıtlar korunur.
          </div>
        )}
      </div>
    </Modal>
  );
}
