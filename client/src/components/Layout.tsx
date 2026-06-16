import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ToastHost } from './Toast';
import { useHeader } from '../store/header';
import { useQuickEntry } from '../store/quickEntry';
import QuickEntryWizard from './QuickEntryWizard';
import BulkAIEntry from './BulkAIEntry';

const TITLES: Record<string, string> = {
  '/timesheet': 'Timesheet',
  '/entries': 'Tüm Aktiviteler',
  '/activities': 'Aktivite Türleri',
  '/contractors': 'Yükleniciler',
  '/customers': 'Müşteriler',
  '/dashboard': 'Dashboard',
  '/team': 'Ekip Takvimi',
  '/reports': 'Raporlar',
  '/users': 'Kullanıcılar',
  '/audit': 'Audit Log',
  '/locks': 'Dönem Kilidi',
};

// Topbar'da başlığın üstünde gösterilen bölüm etiketi (eyebrow)
const SECTIONS: Record<string, string> = {
  '/timesheet': 'Giriş',
  '/entries': 'Giriş',
  '/team': 'Giriş',
  '/dashboard': 'Finans',
  '/reports': 'Finans',
  '/activities': 'Yönetim',
  '/contractors': 'Yönetim',
  '/customers': 'Yönetim',
  '/users': 'Yönetim',
  '/locks': 'Yönetim',
  '/audit': 'Yönetim',
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Aktivite Giriş';
  const section = SECTIONS[loc.pathname];
  const extras = useHeader((s) => s.extras);
  const { wizardOpen, openWizard, closeWizard, bulkAIOpen, closeBulkAI } = useQuickEntry();

  // Cmd+K / Ctrl+K → Hızlı kayıt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openWizard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openWizard]);

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
        {/* Topbar — bölüm etiketi + başlık solda, sayfa aksiyonları sağda */}
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-paper-3/80 h-16 sm:h-[68px] flex items-center justify-between gap-3 px-5 sm:px-7 lg:px-9 shadow-[0_1px_0_rgba(15,23,42,.02)]">
          <div className="pl-12 lg:pl-0 flex-shrink-0 leading-none">
            {section && (
              <div className="text-[10px] font-bold tracking-[.14em] text-ink-4 uppercase mb-1">{section}</div>
            )}
            <div className="text-lg sm:text-xl font-extrabold tracking-tight">{title}</div>
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

      {/* FAB kaldırıldı — sayfa içindeki Hızlı Kayıt butonu + ⌘K yeterli */}

      <QuickEntryWizard open={wizardOpen} onClose={closeWizard} />
      <BulkAIEntry open={bulkAIOpen} onClose={closeBulkAI} />

      <ToastHost />
    </div>
  );
}
