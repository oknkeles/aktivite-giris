import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ToastHost } from './Toast';
import { useHeader } from '../store/header';

const TITLES: Record<string, string> = {
  '/timesheet': 'Timesheet',
  '/entries': 'Tüm Aktiviteler',
  '/activities': 'Aktivite Türleri',
  '/contractors': 'Yükleniciler',
  '/customers': 'Müşteriler',
  '/reports': 'Raporlar',
  '/users': 'Kullanıcılar',
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Aktivite Giriş';
  const extras = useHeader((s) => s.extras);

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

      <ToastHost />
    </div>
  );
}
