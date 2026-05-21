import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Zap } from 'lucide-react';
import Sidebar from './Sidebar';
import { ToastHost } from './Toast';
import { useHeader } from '../store/header';
import QuickEntryWizard from './QuickEntryWizard';

const TITLES: Record<string, string> = {
  '/timesheet': 'Timesheet',
  '/entries': 'Tüm Aktiviteler',
  '/activities': 'Aktivite Türleri',
  '/contractors': 'Yükleniciler',
  '/customers': 'Müşteriler',
  '/reports': 'Raporlar',
  '/users': 'Kullanıcılar',
  '/audit': 'Audit Log',
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Aktivite Giriş';
  const extras = useHeader((s) => s.extras);

  // Cmd+K / Ctrl+K → Hızlı kayıt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Animated background blobs */}
      <div className="bg-blobs">
        <div className="bg-blob b1" />
        <div className="bg-blob b2" />
        <div className="bg-blob b3" />
      </div>

      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <main className="lg:pl-64 min-h-screen flex flex-col">
        {/* Topbar — page title on left, page-specific actions on right */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-paper-3 h-14 sm:h-16 flex items-center justify-between gap-3 px-5 sm:px-7 lg:px-9">
          <div className="text-lg sm:text-xl font-extrabold tracking-tight pl-12 lg:pl-0 flex-shrink-0">
            {title}
          </div>
          {extras && (
            <div className="flex items-center gap-2 min-w-0 overflow-x-auto">{extras}</div>
          )}
        </header>

        {/* Content fills available width — max constrained to 1600px for ultra-wide screens */}
        <div className="flex-1 px-4 sm:px-6 lg:px-9 py-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Floating Quick Entry button — Cmd+K kısayolu da var */}
      <button
        onClick={() => setQuickOpen(true)}
        title="Hızlı Kayıt (⌘K)"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-grad-primary text-white shadow-glow hover:shadow-[0_12px_30px_rgba(37,99,235,.45)] hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center group"
        style={{ backgroundSize: '200% 200%' }}
      >
        <Zap size={22} strokeWidth={2.5} />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap bg-ink text-white text-[11px] font-semibold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none">
          Hızlı Kayıt · ⌘K
        </span>
      </button>

      <QuickEntryWizard open={quickOpen} onClose={() => setQuickOpen(false)} />

      <ToastHost />
    </div>
  );
}
