import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';

interface UserRow {
  id: number;
  username: string;
  fullname: string;
  role: string;
  createdAt: string;
}

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ username: '', fullname: '', password: '', role: 'user' });

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });

  const addMut = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setForm({ username:'', fullname:'', password:'', role:'user' }); toast.show('Kullanıcı eklendi'); },
    onError: (e: any) => toast.show(e.message, 'error'),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.show('Silindi'); },
    onError: (e: any) => toast.show(e.message, 'error'),
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 animate-fade-in">
      <div className="card h-fit">
        <div className="clabel mb-4">Yeni Kullanıcı</div>
        <div className="space-y-3">
          <div><label className="label">Kullanıcı adı</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ahmet" /></div>
          <div><label className="label">Ad soyad</label><input className="input" value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} placeholder="Ahmet Yılmaz" /></div>
          <div><label className="label">Şifre</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><label className="label">Rol</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Kullanıcı (Aktivite Girişi)</option>
              <option value="admin">Yönetici (Tam Yetki)</option>
            </select>
          </div>
          <button className="btn btn-primary w-full" disabled={!form.username || !form.password || addMut.isPending} onClick={() => addMut.mutate()}>
            <Plus size={16} /> Kullanıcı Ekle
          </button>
        </div>
      </div>

      <div className="card">
        <div className="clabel mb-4">Kullanıcılar ({users.length})</div>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {users.map((u) => (
            <div key={u.id} className="border border-paper-3 rounded-xl p-4 flex items-center gap-3 hover:border-brand-violet/30 transition">
              <div className="w-11 h-11 rounded-full bg-grad-primary text-white font-extrabold flex items-center justify-center flex-shrink-0">
                {u.fullname.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold truncate">{u.fullname}</div>
                <div className="text-[11px] text-ink-3 flex items-center gap-1.5 mt-0.5 flex-wrap">
                  @{u.username}
                  <span className={`badge ${u.role === 'admin' ? 'bg-brand-indigo/15 text-brand-indigo' : 'bg-paper-2 text-ink-2'}`}>
                    {u.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}
                  </span>
                  {u.id === me?.id && <span className="badge bg-brand-emerald/15 text-brand-emerald">Aktif</span>}
                </div>
              </div>
              {u.id !== me?.id && (
                <button onClick={() => delMut.mutate(u.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
