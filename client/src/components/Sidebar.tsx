import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Calendar, List, CheckSquare, Users, UserCog, BarChart3, LogOut, Menu, X,
  ShieldCheck, ChevronDown, Briefcase, ScrollText, LayoutDashboard, Lock, CalendarRange
} from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useAuth, isAdmin } from '../store/auth';
import { useQueryClient } from '@tanstack/react-query';

const ENTRY_ITEMS = [
  { to: '/timesheet', icon: Calendar, label: 'Timesheet' },
  { to: '/entries', icon: List, label: 'Tüm Aktiviteler' },
];

const ADMIN_ITEMS = [
  { to: '/activities', icon: CheckSquare, label: 'Aktivite Türleri' },
  { to: '/contractors', icon: Briefcase, label: 'Yükleniciler' },
  { to: '/customers', icon: UserCog, label: 'Müşteriler' },
  { to: '/users', icon: Users, label: 'Kullanıcılar' },
  { to: '/locks', icon: Lock, label: 'Dönem Kilidi' },
  { to: '/audit', icon: ScrollText, label: 'Audit Log' },
];

const FINANCE_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/team', icon: CalendarRange, label: 'Ekip Takvimi' },
  { to: '/reports', icon: BarChart3, label: 'Raporlar' },
];

export default function Sidebar({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (b: boolean) => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const admin = isAdmin(user);
  const qc = useQueryClient();

  // Auto-open admin panel if currently on an admin route
  const isOnAdminPage = ADMIN_ITEMS.some(i => i.to === loc.pathname);
  const [adminOpen, setAdminOpen] = useState(isOnAdminPage);

  useEffect(() => {
    if (isOnAdminPage) setAdminOpen(true);
  }, [isOnAdminPage]);

  function doLogout() {
    // Kullanıcı verilerini bellekten temizle — bir sonraki kullanıcı eski kayıtları görmesin
    qc.clear();
    logout();
    navigate('/login');
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-ink/50 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 bottom-0 w-64 bg-[linear-gradient(180deg,#0F1B3D_0%,#0B1224_100%)] z-50',
          'flex flex-col transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand — TDev logosu beyaz kutu içinde (logo lacivert/mavi olduğu için kontrast) */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
          <div className="bg-white rounded-lg px-2.5 py-1.5 flex items-center justify-center flex-shrink-0">
            <img src="/logo.png" alt="TDev Consulting" className="h-7 w-auto object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-white/90 tracking-tight leading-tight">Aktivite</div>
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Giriş Sistemi</div>
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
          {/* Giriş section */}
          <div>
            <div className="text-[9.5px] font-bold tracking-[.12em] text-white/30 uppercase px-3 pt-3 pb-1">
              Giriş
            </div>
            {ENTRY_ITEMS.map((it) => (
              <NavItem key={it.to} {...it} onNav={() => setMobileOpen(false)} />
            ))}
          </div>

          {/* Admin Paneli — collapsible (admin only) */}
          {admin && (
            <div className="mt-2">
              <button
                onClick={() => setAdminOpen(o => !o)}
                className={clsx(
                  'group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition mt-3',
                  isOnAdminPage
                    ? 'bg-gradient-to-r from-brand-violet/20 via-brand-pink/10 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(37,99,235,.25)]'
                    : 'text-white/65 hover:bg-white/5 hover:text-white/95'
                )}
              >
                <ShieldCheck size={16} className={isOnAdminPage ? 'text-brand-violet/90' : ''} />
                <span className="flex-1 text-left">Admin Paneli</span>
                <ChevronDown
                  size={14}
                  className={clsx('transition-transform text-white/40', adminOpen && 'rotate-180')}
                />
              </button>
              <div className={clsx(
                'grid transition-[grid-template-rows] duration-300 ease-out',
                adminOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}>
                <div className="overflow-hidden">
                  <div className="pl-3 mt-1 space-y-0.5 border-l border-white/10 ml-4">
                    {ADMIN_ITEMS.map((it) => (
                      <NavItem key={it.to} {...it} indented onNav={() => setMobileOpen(false)} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Finans section (admin only) */}
          {admin && (
            <div className="mt-2">
              <div className="text-[9.5px] font-bold tracking-[.12em] text-white/30 uppercase px-3 pt-3 pb-1">
                Finans
              </div>
              {FINANCE_ITEMS.map((it) => (
                <NavItem key={it.to} {...it} onNav={() => setMobileOpen(false)} />
              ))}
            </div>
          )}
        </nav>
      </aside>

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

function NavItem({ to, icon: Icon, label, indented = false, onNav }: {
  to: string;
  icon: typeof Calendar;
  label: string;
  indented?: boolean;
  onNav: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNav}
      className={({ isActive }) => clsx(
        'group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition',
        indented && 'text-[12.5px] py-2',
        isActive
          ? 'bg-gradient-to-r from-brand-indigo/25 via-brand-violet/15 to-brand-pink/10 text-white shadow-[inset_0_0_0_1px_rgba(37,99,235,.3)]'
          : 'text-white/55 hover:bg-white/5 hover:text-white/90'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && !indented && (
            <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-grad-primary shadow-[0_0_14px_rgba(37,99,235,.7)]" />
          )}
          <Icon size={indented ? 14 : 16} className={isActive ? 'text-brand-violet/90' : ''} />
          {label}
        </>
      )}
    </NavLink>
  );
}
