import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, EyeOff, Eye, Loader2 } from 'lucide-react';
import { api, type Activity } from '../api/client';
import { useAuth, isAdmin } from '../store/auth';
import { useToast } from '../components/Toast';

export default function Activities() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('saat');
  const [desc, setDesc] = useState('');

  const { data: list = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
  });

  const addMut = useMutation({
    mutationFn: () => api.post('/activities', { name, unit, desc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); setName(''); setDesc(''); toast.show('Aktivite eklendi'); },
    onError: (e: any) => toast.show(e.message, 'error'),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/activities/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); toast.show('Silindi'); },
    onError: (e: any) => toast.show(e.message || 'Silinemedi', 'error'),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.patch(`/activities/${id}`, { active }),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['activities'] }); toast.show(v.active ? 'Aktif edildi' : 'Pasife çekildi'); },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1.5fr] gap-5 animate-fade-in">
      {admin && (
        <div className="card">
          <div className="clabel mb-4">Yeni Aktivite Türü</div>
          <div className="space-y-3">
            <div>
              <label className="label">Aktivite Adı</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Senior Danışman" />
            </div>
            <div>
              <label className="label">Birim</label>
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="saat">Saat</option>
                <option value="gün">Gün</option>
                <option value="adet">Adet</option>
              </select>
            </div>
            <div>
              <label className="label">Açıklama</label>
              <textarea className="input min-h-20" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Kapsam, koşullar..." />
            </div>
            <button className="btn btn-primary w-full" disabled={!name || addMut.isPending} onClick={() => addMut.mutate()}>
              {addMut.isPending ? <><Loader2 size={16} className="animate-spin" /> Ekleniyor...</> : <><Plus size={16} /> Aktivite Ekle</>}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="clabel mb-4">Aktivite Türleri ({list.length})</div>
        {list.length === 0 ? (
          <div className="text-center py-10 text-ink-3">
            <div className="text-4xl mb-3 animate-pulse-slow">📋</div>
            <div className="text-sm">Henüz eklenmedi</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((a) => (
              <div key={a.id} className={`border border-paper-3 rounded-xl p-3 hover:border-brand-violet/30 transition ${a.active === false ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    {a.name}
                    {a.active === false && <span className="badge bg-ink/10 text-ink-2 flex-shrink-0">Pasif</span>}
                  </div>
                  <span className="tag">{a.unit}</span>
                </div>
                {a.desc && <div className="text-[11px] text-ink-3 truncate">{a.desc}</div>}
                {admin && (
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      onClick={() => toggleMut.mutate({ id: a.id, active: a.active === false })}
                      className="text-ink-3 hover:text-ink hover:bg-paper-2 p-1.5 rounded-lg transition"
                      title={a.active === false ? 'Aktife al' : 'Pasife çek'}
                    >
                      {a.active === false ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button onClick={() => delMut.mutate(a.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition" title="Sil">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
