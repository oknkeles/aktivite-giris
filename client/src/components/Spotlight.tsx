// Spotlight / komut paleti — ⌘K. Yazarak sayfaya atla, müşteri ara (raporuna git),
// hızlı kayıt / AI giriş başlat, tema değiştir, çıkış. Klavyeyle gezilir.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Calendar, List, CalendarRange, LayoutDashboard, BarChart3,
  CheckSquare, Briefcase, UserCog, Users, Lock, ScrollText,
  Zap, Wand2, Moon, Sun, LogOut, CornerDownLeft, Building2,
} from 'lucide-react';
import clsx from 'clsx';
import { useSpotlight } from '../store/spotlight';
import { useQuickEntry } from '../store/quickEntry';
import { useTheme } from '../store/theme';
import { useAuth, isAdmin } from '../store/auth';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Customer } from '../api/client';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: any;
  run: () => void;
  keywords?: string;
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

export default function Spotlight() {
  const open = useSpotlight((s) => s.open);
  const setOpen = useSpotlight((s) => s.setOpen);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  const admin = isAdmin(user);
  const { openWizard, openBulkAI } = useQuickEntry();
  const { theme, toggle: toggleTheme } = useTheme();

  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<Customer[]>('/customers'),
    enabled: open && admin,
  });

  // Açılışta sıfırla + odak
  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  function close() { setOpen(false); }
  function go(path: string) { navigate(path); close(); }

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];

    // Aksiyonlar
    list.push({ id: 'act-quick', group: 'Aksiyon', label: 'Hızlı Kayıt', hint: 'Aktivite ekle', icon: Zap, keywords: 'ekle giris yeni', run: () => { close(); openWizard(); } });
    list.push({ id: 'act-bulk', group: 'Aksiyon', label: 'AI ile Toplu Giriş', hint: 'Metinden kayıt', icon: Wand2, keywords: 'yapay zeka metin', run: () => { close(); openBulkAI(); } });
    list.push({ id: 'act-theme', group: 'Aksiyon', label: theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç', icon: theme === 'dark' ? Sun : Moon, keywords: 'tema dark light renk', run: () => { toggleTheme(); close(); } });
    list.push({ id: 'act-logout', group: 'Aksiyon', label: 'Çıkış Yap', icon: LogOut, keywords: 'logout exit', run: () => { qc.clear(); logout(); navigate('/login'); close(); } });

    // Sayfalar
    const pages: { to: string; label: string; icon: any; admin?: boolean }[] = [
      { to: '/timesheet', label: 'Timesheet', icon: Calendar },
      { to: '/entries', label: 'Tüm Aktiviteler', icon: List },
      { to: '/team', label: 'Ekip Takvimi', icon: CalendarRange, admin: true },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, admin: true },
      { to: '/reports', label: 'Raporlar', icon: BarChart3, admin: true },
      { to: '/activities', label: 'Aktivite Türleri', icon: CheckSquare, admin: true },
      { to: '/contractors', label: 'Yükleniciler', icon: Briefcase, admin: true },
      { to: '/customers', label: 'Müşteriler', icon: UserCog, admin: true },
      { to: '/users', label: 'Kullanıcılar', icon: Users, admin: true },
      { to: '/locks', label: 'Dönem Kilidi', icon: Lock, admin: true },
      { to: '/audit', label: 'Audit Log', icon: ScrollText, admin: true },
    ];
    pages.filter((p) => !p.admin || admin).forEach((p) =>
      list.push({ id: 'page-' + p.to, group: 'Sayfa', label: p.label, icon: p.icon, run: () => go(p.to) })
    );

    // Müşteriler (admin) → raporuna atla
    if (admin) {
      customers.forEach((c) =>
        list.push({
          id: 'cus-' + c.id,
          group: 'Müşteri',
          label: c.name,
          hint: 'Raporu aç',
          icon: Building2,
          keywords: c.contractor?.name,
          run: () => go(`/reports?customerId=${c.id}`),
        })
      );
    }
    return list;
  }, [admin, customers, theme]);

  const filtered = useMemo(() => {
    const query = trLower(q.trim());
    if (!query) {
      // Boşken: aksiyonlar + sayfalar (müşterileri arama yapınca göster)
      return items.filter((i) => i.group !== 'Müşteri');
    }
    return items.filter((i) =>
      trLower(i.label).includes(query) || (i.keywords && trLower(i.keywords).includes(query))
    );
  }, [items, q]);

  useEffect(() => { setActive(0); }, [q]);

  // Klavye
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active]);

  // Aktif öğeyi görünür tut
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  // Grupları sırayla render et ama düz index koru
  let idx = -1;
  const groups = ['Aksiyon', 'Sayfa', 'Müşteri'].filter((g) => filtered.some((i) => i.group === g));

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4 animate-fade-in"
      onClick={close}
    >
      <div
        className="w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-paper-3 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arama */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-paper-3">
          <Search size={18} className="text-ink-3 flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara veya komut yaz — sayfa, müşteri, aksiyon…"
            className="flex-1 bg-transparent outline-none text-[15px] text-ink placeholder-ink-4"
          />
          <kbd className="text-[10px] font-mono text-ink-4 bg-paper-2 border border-paper-3 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Sonuçlar */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-ink-3 text-sm">"{q}" için sonuç yok</div>
          ) : (
            groups.map((group) => (
              <div key={group}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4 px-4 pt-2.5 pb-1">{group}</div>
                {filtered.filter((i) => i.group === group).map((it) => {
                  idx++;
                  const myIdx = idx;
                  const isActive = myIdx === active;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      data-idx={myIdx}
                      onMouseEnter={() => setActive(myIdx)}
                      onClick={() => it.run()}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition',
                        isActive ? 'bg-brand-indigo/10' : 'hover:bg-paper-2'
                      )}
                    >
                      <span className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', isActive ? 'bg-brand-indigo/15 text-brand-indigo' : 'bg-paper-2 text-ink-3')}>
                        <Icon size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-[13.5px] font-semibold text-ink block truncate">{it.label}</span>
                        {it.hint && <span className="text-[11px] text-ink-3">{it.hint}</span>}
                      </span>
                      {isActive && <CornerDownLeft size={14} className="text-ink-4 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
