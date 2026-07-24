import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Phone, Sparkles, Loader2, Check, Search, X, Building2, Eye } from 'lucide-react';
import { api, type Activity, type Contractor } from '../api/client';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

interface UserRow {
  id: number;
  username: string;
  fullname: string;
  role: string;
  phone?: string | null;
  defaultActivityId?: number | null;
  defaultActivity?: { id: number; name: string; unit: string } | null;
  contractorId?: number | null;
  contractor?: { id: number; name: string } | null;
  scopes?: { contractorId: number }[];
  createdAt: string;
}

export default function Users() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserRow | null | 'new'>(null);

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const { data: activities = [] } = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const { data: contractors = [] } = useQuery({ queryKey: ['contractors'], queryFn: () => api.get<Contractor[]>('/contractors') });

  const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
  const filtered = useMemo(() => {
    const q = trLower(search.trim());
    if (!q) return users;
    return users.filter((u) => trLower(u.fullname).includes(q) || trLower(u.username).includes(q));
  }, [users, search]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="clabel">
            Kullanıcılar
            <span className="text-ink-3 font-normal normal-case tracking-normal ml-1.5">
              {search ? `${filtered.length} / ${users.length}` : `(${users.length})`}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input className="input !pl-9 !pr-8 !py-2 text-sm" placeholder="Kullanıcı ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"><X size={14} /></button>}
            </div>
            <button className="btn btn-primary btn-sm whitespace-nowrap" onClick={() => setEditing('new')}><Plus size={15} /> Yeni Kullanıcı</button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-ink-3"><div className="text-3xl mb-2">🔍</div><div className="text-sm">Eşleşen kullanıcı yok</div></div>
        ) : (
          <div className="border border-paper-3 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_1fr_48px] gap-2 bg-paper-2 border-b border-paper-3 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-ink-3">
              <span>Kullanıcı</span>
              <span>Rol</span>
              <span className="hidden sm:block">Bilgiler</span>
              <span></span>
            </div>
            {filtered.map((u) => (
              <div key={u.id} className="grid grid-cols-[1fr_90px_1fr_48px] gap-2 items-center px-4 py-2.5 border-b border-paper-3 last:border-0 hover:bg-paper transition text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-grad-primary text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">
                    {u.fullname.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      {u.fullname}
                      {u.id === me?.id && <span className="badge bg-brand-emerald/15 text-brand-emerald flex-shrink-0">Sen</span>}
                    </div>
                    <div className="text-[11px] text-ink-3 truncate">@{u.username}</div>
                  </div>
                </div>
                <div>
                  <span className={`badge ${u.role === 'admin' ? 'bg-brand-indigo/15 text-brand-indigo' : u.role === 'py' ? 'bg-brand-amber/15 text-[#B45309]' : 'bg-paper-2 text-ink-2'}`}>
                    {u.role === 'admin' ? 'Yönetici' : u.role === 'py' ? 'PY (Proje Yön.)' : 'Kullanıcı'}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 flex-wrap min-w-0">
                  {u.contractor && <span className="badge bg-brand-emerald/15 text-brand-emerald !text-[10px] flex items-center gap-0.5"><Building2 size={9} /> {u.contractor.name}</span>}
                  {u.phone && <span className="badge bg-brand-cyan/15 text-brand-cyan font-mono !text-[10px] flex items-center gap-0.5"><Phone size={9} /> {u.phone}</span>}
                  {u.defaultActivity && <span className="badge bg-brand-violet/15 text-brand-violet !text-[10px] flex items-center gap-0.5"><Sparkles size={9} /> {u.defaultActivity.name}</span>}
                  {!u.phone && !u.defaultActivity && <span className="text-ink-3 text-[12px]">—</span>}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setEditing(u)} className="text-brand-indigo hover:bg-brand-indigo/10 p-2 rounded-lg transition" title="Düzenle"><Pencil size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== null && (
        <UserModal user={editing === 'new' ? null : editing} me={me?.id} activities={activities} contractors={contractors} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function UserModal({ user, me, activities, contractors, onClose }: { user: UserRow | null; me?: number; activities: Activity[]; contractors: Contractor[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNew = !user;
  const [scopeIds, setScopeIds] = useState<number[]>(user?.scopes?.map((s) => s.contractorId) || []);
  const [form, setForm] = useState({
    username: user?.username || '',
    fullname: user?.fullname || '',
    password: '',
    role: user?.role || 'user',
    phone: user?.phone || '',
    defaultActivityId: user?.defaultActivityId ? String(user.defaultActivityId) : '',
    contractorId: user?.contractorId ? String(user.contractorId) : '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: any = {
        fullname: form.fullname,
        role: form.role,
        phone: form.phone.trim() || null,
        defaultActivityId: form.defaultActivityId ? Number(form.defaultActivityId) : null,
        contractorId: form.contractorId ? Number(form.contractorId) : null,
        scopeContractorIds: scopeIds,
      };
      if (form.password) payload.password = form.password;
      if (isNew) { payload.username = form.username; return api.post('/users', payload); }
      return api.put(`/users/${user!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
      toast.show(isNew ? 'Kullanıcı eklendi' : 'Güncellendi');
      onClose();
    },
    onError: (e: any) => toast.show(e.message || 'Hata', 'error'),
  });
  const delMut = useMutation({
    mutationFn: () => api.delete(`/users/${user!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.show('Silindi'); onClose(); },
    onError: (e: any) => toast.show(e.message || 'Silinemedi', 'error'),
  });

  const valid = form.fullname.trim() && (isNew ? form.username.trim() && form.password : true);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      busy={saveMut.isPending || delMut.isPending}
      busyLabel={delMut.isPending ? 'Siliniyor…' : 'Kaydediliyor…'}
      title={isNew ? 'Yeni Kullanıcı' : <><strong>{user!.fullname}</strong> <span className="text-ink-3 font-normal">düzenle</span></>}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div>
            {!isNew && user!.id !== me && (confirmDelete ? (
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
            <button className="btn btn-primary" disabled={!valid || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? <><Loader2 size={14} className="animate-spin" /> Kaydediliyor...</> : <><Check size={14} /> {isNew ? 'Ekle' : 'Güncelle'}</>}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Kullanıcı adı</label>
            <input className="input disabled:opacity-60" value={form.username} disabled={!isNew} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ahmet" />
            {!isNew && <div className="text-[10px] text-ink-3 mt-1">Kullanıcı adı değiştirilemez</div>}
          </div>
          <div>
            <label className="label">Ad soyad</label>
            <input className="input" value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} placeholder="Ahmet Yılmaz" />
          </div>
          <div>
            <label className="label">{isNew ? 'Şifre' : 'Yeni Şifre'} {!isNew && <span className="text-[10px] text-ink-3 font-normal">(boş = değiştirme)</span>}</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Rol</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Kullanıcı (Aktivite Girişi)</option>
              <option value="py">PY — Proje Yöneticisi (Tüm veriyi görür, yönetemez)</option>
              <option value="admin">Yönetici (Tam Yetki)</option>
            </select>
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><Building2 size={12} /> Şirket (Yüklenici)</label>
            <select className="input" value={form.contractorId} onChange={(e) => setForm({ ...form, contractorId: e.target.value })}>
              <option value="">— Seçilmedi —</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="text-[10.5px] text-ink-3 mt-1">
              Komisyonu belirler: kişinin şirketi müşterinin yüklenicisiyle aynıysa komisyon uygulanmaz.
            </div>
          </div>
          {form.role !== 'user' && (
            <div className="sm:col-span-2">
              <label className="label flex items-center gap-1.5"><Eye size={12} /> Sorumlu Olduğu Yükleniciler (görünürlük)</label>
              <div className="flex flex-wrap gap-1.5">
                {contractors.map((c) => {
                  const on = scopeIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setScopeIds((prev) => on ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition ${
                        on ? 'bg-brand-indigo/10 border-brand-indigo/40 text-brand-indigo'
                           : 'bg-paper-2 border-paper-3 text-ink-3 hover:text-ink hover:border-ink-3/40'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10.5px] text-ink-3 mt-1">
                Yalnızca seçili yüklenicilere ait müşterilerin kayıtlarını, raporlarını ve takvimini görür.
                Boş bırakılırsa sadece kendi şirketini görür. Komisyonu ETKİLEMEZ.
              </div>
            </div>
          )}
          <div>
            <label className="label flex items-center gap-1.5"><Phone size={12} /> WhatsApp Telefon</label>
            <input className="input font-mono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+905551234567" />
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><Sparkles size={12} /> Varsayılan Aktivite</label>
            <select className="input" value={form.defaultActivityId} onChange={(e) => setForm({ ...form, defaultActivityId: e.target.value })}>
              <option value="">— Seçilmedi —</option>
              {activities.filter((a) => a.active !== false).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
            </select>
          </div>
        </div>
        {isNew && <div className="text-[10.5px] text-ink-3">Telefon E.164 formatında olmalı (örn. +905551234567). Varsayılan aktivite yeni kayıtlarda otomatik seçilir.</div>}
      </div>
    </Modal>
  );
}
