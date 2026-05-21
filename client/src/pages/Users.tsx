import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Phone, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { api, type Activity } from '../api/client';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';

interface UserRow {
  id: number;
  username: string;
  fullname: string;
  role: string;
  phone?: string | null;
  defaultActivityId?: number | null;
  defaultActivity?: { id: number; name: string; unit: string } | null;
  createdAt: string;
}

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    username: '', fullname: '', password: '', role: 'user',
    phone: '', defaultActivityId: '' as string,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    fullname: '', role: 'user', phone: '', password: '',
    defaultActivityId: '' as string,
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => api.get<Activity[]>('/activities'),
  });

  const addMut = useMutation({
    mutationFn: () =>
      api.post('/users', {
        username: form.username,
        fullname: form.fullname,
        password: form.password,
        role: form.role,
        phone: form.phone.trim() || null,
        defaultActivityId: form.defaultActivityId ? Number(form.defaultActivityId) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setForm({ username: '', fullname: '', password: '', role: 'user', phone: '', defaultActivityId: '' });
      toast.show('Kullanıcı eklendi');
    },
    onError: (e: any) => toast.show(e.message, 'error'),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      api.put(`/users/${editingId}`, {
        fullname: editForm.fullname,
        role: editForm.role,
        phone: editForm.phone.trim() || null,
        defaultActivityId: editForm.defaultActivityId
          ? Number(editForm.defaultActivityId)
          : null,
        ...(editForm.password ? { password: editForm.password } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] }); // me cache de invalidate
      setEditingId(null);
      toast.show('Güncellendi');
    },
    onError: (e: any) => toast.show(e.message, 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setConfirmDeleteId(null);
      toast.show('Silindi');
    },
    onError: (e: any) => toast.show(e.message, 'error'),
  });

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEditForm({
      fullname: u.fullname,
      role: u.role,
      phone: u.phone || '',
      password: '',
      defaultActivityId: u.defaultActivityId ? String(u.defaultActivityId) : '',
    });
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 animate-fade-in">
      <div className="card h-fit">
        <div className="clabel mb-4">Yeni Kullanıcı</div>
        <div className="space-y-3">
          <div>
            <label className="label">Kullanıcı adı</label>
            <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ahmet" />
          </div>
          <div>
            <label className="label">Ad soyad</label>
            <input className="input" value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} placeholder="Ahmet Yılmaz" />
          </div>
          <div>
            <label className="label">Şifre</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Phone size={12} /> WhatsApp Telefon
              <span className="text-[10px] font-normal text-ink-3">(isteğe bağlı)</span>
            </label>
            <input
              className="input font-mono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+905551234567"
            />
            <div className="text-[10.5px] text-ink-3 mt-1">E.164 formatı: ülke kodu ile, boşluksuz (örn. +905551234567)</div>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Sparkles size={12} /> Varsayılan Aktivite
              <span className="text-[10px] font-normal text-ink-3">(yeni kayıtlarda otomatik seçilir)</span>
            </label>
            <select className="input" value={form.defaultActivityId} onChange={(e) => setForm({ ...form, defaultActivityId: e.target.value })}>
              <option value="">— Seçilmedi —</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Rol</label>
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
          {users.map((u) => {
            const isEditing = editingId === u.id;
            const isConfirmingDelete = confirmDeleteId === u.id;

            if (isEditing) {
              return (
                <div key={u.id} className="border-2 border-brand-indigo/40 rounded-xl p-4 bg-brand-indigo/5 space-y-2 col-span-1 md:col-span-2 2xl:col-span-3">
                  <div className="clabel mb-2">@{u.username} düzenleniyor</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="label">Ad Soyad</label>
                      <input className="input" value={editForm.fullname} onChange={(e) => setEditForm({ ...editForm, fullname: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Rol</label>
                      <select className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                        <option value="user">Kullanıcı</option>
                        <option value="admin">Yönetici</option>
                      </select>
                    </div>
                    <div>
                      <label className="label flex items-center gap-1.5"><Phone size={12} /> WhatsApp Telefon</label>
                      <input
                        className="input font-mono"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="+905551234567"
                      />
                    </div>
                    <div>
                      <label className="label">Yeni Şifre <span className="text-[10px] text-ink-3 font-normal">(boş bırak değiştirme)</span></label>
                      <input className="input" type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label flex items-center gap-1.5">
                        <Sparkles size={12} /> Varsayılan Aktivite
                      </label>
                      <select className="input" value={editForm.defaultActivityId} onChange={(e) => setEditForm({ ...editForm, defaultActivityId: e.target.value })}>
                        <option value="">— Seçilmedi —</option>
                        {activities.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button className="btn btn-primary" disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>Kaydet</button>
                    <button className="btn" onClick={() => setEditingId(null)}>İptal</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={u.id} className={clsx('border border-paper-3 rounded-xl p-4 flex items-center gap-3 hover:border-brand-violet/30 transition')}>
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
                    {u.phone && (
                      <span className="badge bg-brand-cyan/15 text-brand-cyan font-mono !text-[10px] flex items-center gap-0.5">
                        <Phone size={9} /> {u.phone}
                      </span>
                    )}
                    {u.defaultActivity && (
                      <span className="badge bg-brand-violet/15 text-brand-violet !text-[10px] flex items-center gap-0.5">
                        <Sparkles size={9} /> {u.defaultActivity.name}
                      </span>
                    )}
                  </div>
                </div>
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => delMut.mutate(u.id)} className="text-[11px] font-bold bg-brand-rose text-white px-2.5 py-1 rounded-lg hover:bg-brand-rose/90">Sil</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-semibold text-ink-2 px-2 py-1 rounded-lg hover:bg-paper-2">Vazgeç</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => startEdit(u)} className="text-brand-indigo hover:bg-brand-indigo/10 p-1.5 rounded-lg transition" title="Düzenle">
                      <Pencil size={14} />
                    </button>
                    {u.id !== me?.id && (
                      <button onClick={() => setConfirmDeleteId(u.id)} className="text-brand-rose hover:bg-brand-rose/10 p-1.5 rounded-lg transition" title="Sil">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
