import { NavLink, useNavigate } from 'react-router-dom';
import {
  Calendar, List, CheckSquare, Users, UserCog, BarChart3, LogOut, Trash2, Menu, X
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuth, isAdmin } from '../store/auth';

const navItems = (admin: boolean) => [
  { section: 'Giriş', items: [
    { to: '/timesheet', icon: Calendar, label: 'Timesheet' },
    { to: '/entries', icon: List, label: 'Tüm Aktiviteler' },
  ]},
  { section: 'Tanımlar', items: [
    { to: '/activities', icon: CheckSquare, label: 'Aktivite Türleri' },
    { to: '/contractors', icon: Users, label: 'Yükleniciler' },
    { to: '/customers', icon: UserCog, label: 'Müşteriler' },
  ]},
  ...(admin ? [
    { section: 'Finans', items: [
      { to: '/reports', icon: BarChart3, label: 'Raporlar' },
    ]},
    { section: 'Sistem', items: [
      { to: '/users', icon: Users, label: 'Kullanıcılar' },
    ]},
  ] : []),
];

export default function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (b: boolean) => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const admin = isAdmin(user);
  const sections = navItems(admin);

  function doLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-ink/50 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 bottom-0 w-64 bg-[linear-gradient(180deg,#1A1438_0%,#0E0B26_100%)] z-50',
          'flex flex-col transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 p-5 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-grad-primary shadow-[0_6px_20px_rgba(168,85,247,.45)] flex items-center justify-center text-white animate-shimmer"
               style={{ backgroundSize: '200% 200%' }}>
            <Calendar size={20} strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-white tracking-tight">Aktivite Giriş</div>
            <div className="text-[9.5px] font-bold text-white/30 uppercase tracking-widest mt-0.5">v5.0 · Cloud</div>
          </div>
          <button
            className="lg:hidden text-white/60 hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* User */}
        <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-white/[.02]">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-[#7C4DFF] flex items-center justify-center text-white text-sm font-extrabold shadow-md">
            {user?.fullname?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white/90 leading-tight truncate">{user?.fullname || '—'}</div>
            <div className={clsx(
              'text-[10px] font-bold tracking-wide mt-0.5',
              admin ? 'text-brand-violet/80' : 'text-white/40'
            )}>
              {admin ? 'YÖNETİCİ' : 'KULLANICI'}
            </div>
          </div>
          <button
            onClick={doLogout}
            className="text-white/40 hover:text-white text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 transition"
            title="Çıkış"
          >
            <LogOut size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {sections.map((s) => (
            <div key={s.section} className="mt-2 first:mt-0">
              <div className="text-[9.5px] font-bold tracking-[.12em] text-white/30 uppercase px-3 pt-3 pb-1">
                {s.section}
              </div>
              {s.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => clsx(
                    'group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition',
                    isActive
                      ? 'bg-gradient-to-r from-brand-indigo/25 via-brand-violet/15 to-brand-pink/10 text-white shadow-[inset_0_0_0_1px_rgba(168,85,247,.25)]'
                      : 'text-white/55 hover:bg-white/5 hover:text-white/90'
                  )}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-grad-primary shadow-[0_0_14px_rgba(168,85,247,.7)]" />
                      )}
                      <it.icon size={16} className={isActive ? 'text-brand-violet/90' : ''} />
                      {it.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile burger button */}
      <button
        className="lg:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-xl bg-white border border-paper-3 shadow-md flex items-center justify-center text-ink-2"
        onClick={() => setMobileOpen(true)}
        aria-label="Menüyü aç"
      >
        <Menu size={18} />
      </button>
    </>
  );
}
