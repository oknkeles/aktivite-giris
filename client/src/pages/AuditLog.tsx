import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, LogIn, AlertTriangle, Edit3, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../api/client';

interface AuditEntry {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  target: string;
  targetId: number | null;
  summary: string | null;
  ip: string | null;
  createdAt: string;
}

const ACTION_META: Record<
  string,
  { icon: any; color: string; label: string }
> = {
  create: { icon: Plus, color: 'bg-brand-emerald/15 text-brand-emerald', label: 'Oluştur' },
  update: { icon: Edit3, color: 'bg-brand-indigo/15 text-brand-indigo', label: 'Güncelle' },
  delete: { icon: Trash2, color: 'bg-brand-rose/15 text-brand-rose', label: 'Sil' },
  login: { icon: LogIn, color: 'bg-brand-cyan/15 text-brand-cyan', label: 'Giriş' },
  login_fail: { icon: AlertTriangle, color: 'bg-brand-amber/15 text-brand-amber', label: 'Giriş Hatası' },
};

const TARGET_LABEL: Record<string, string> = {
  entry: 'Kayıt',
  user: 'Kullanıcı',
  customer: 'Müşteri',
  contractor: 'Yüklenici',
  activity: 'Aktivite',
  rate: 'Fiyat',
  session: 'Oturum',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export default function AuditLog() {
  const [actionFilter, setActionFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit', actionFilter, targetFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (targetFilter) params.set('target', targetFilter);
      params.set('limit', '300');
      return api.get<AuditEntry[]>(`/audit?${params.toString()}`);
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, AuditEntry[]> = {};
    logs.forEach((l) => {
      const day = l.createdAt.substring(0, 10);
      (map[day] = map[day] || []).push(l);
    });
    return map;
  }, [logs]);

  const days = useMemo(() => Object.keys(grouped).sort().reverse(), [grouped]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-brand-indigo" />
            <span className="clabel !text-sm !normal-case !tracking-normal font-bold">
              Audit Log — Önemli aksiyon izi
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="input !w-auto !py-1.5 text-xs"
            >
              <option value="">Tüm aksiyonlar</option>
              <option value="create">Oluştur</option>
              <option value="update">Güncelle</option>
              <option value="delete">Sil</option>
              <option value="login">Giriş</option>
              <option value="login_fail">Giriş Hatası</option>
            </select>
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="input !w-auto !py-1.5 text-xs"
            >
              <option value="">Tüm hedefler</option>
              <option value="entry">Kayıt</option>
              <option value="user">Kullanıcı</option>
              <option value="customer">Müşteri</option>
              <option value="contractor">Yüklenici</option>
              <option value="activity">Aktivite</option>
              <option value="session">Oturum</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-ink-3 text-sm">Yükleniyor…</div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-ink-3 text-sm">
            Bu filtreye uygun kayıt yok.
          </div>
        ) : (
          <div className="space-y-6">
            {days.map((day) => {
              const items = grouped[day];
              const d = new Date(day + 'T00:00:00');
              return (
                <div key={day}>
                  <div className="clabel mb-2">
                    {d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })}
                  </div>
                  <div className="border border-paper-3 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-3 bg-paper-2">
                          <th className="px-3 py-2 w-[100px]">Saat</th>
                          <th className="px-3 py-2 w-[120px]">Aksiyon</th>
                          <th className="px-3 py-2 w-[110px]">Hedef</th>
                          <th className="px-3 py-2 w-[140px]">Kullanıcı</th>
                          <th className="px-3 py-2">Açıklama</th>
                          <th className="px-3 py-2 text-right">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((l) => {
                          const meta = ACTION_META[l.action] || {
                            icon: Edit3,
                            color: 'bg-paper-2 text-ink-2',
                            label: l.action,
                          };
                          const Icon = meta.icon;
                          return (
                            <tr key={l.id} className="border-t border-paper-3 hover:bg-paper-2/40 transition">
                              <td className="px-3 py-2 text-[11px] text-ink-3 font-mono">
                                {new Date(l.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </td>
                              <td className="px-3 py-2">
                                <span className={clsx('badge inline-flex items-center gap-1', meta.color)}>
                                  <Icon size={11} />
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-[11px] text-ink-2">
                                {TARGET_LABEL[l.target] || l.target}
                                {l.targetId && <span className="text-ink-4 font-mono"> #{l.targetId}</span>}
                              </td>
                              <td className="px-3 py-2 text-[11.5px]">
                                {l.username ? (
                                  <span className="font-mono">@{l.username}</span>
                                ) : (
                                  <span className="text-ink-4">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-[11.5px] text-ink">
                                {l.summary || <span className="text-ink-4">—</span>}
                              </td>
                              <td className="px-3 py-2 text-[10.5px] text-ink-4 font-mono text-right">
                                {l.ip || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
