import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sparkles, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { ToastHost } from './Toast';
import { useHeader } from '../store/header';
import { useQuickEntry } from '../store/quickEntry';
import { useSpotlight } from '../store/spotlight';
import { useAssistant } from '../store/assistant';
import QuickEntryWizard from './QuickEntryWizard';
import BulkAIEntry from './BulkAIEntry';
import Spotlight from './Spotlight';
import AssistantChat from './AssistantChat';

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

const SECTIONS: Record<string, string> = {
  '/timesheet': 'Giriş', '/entries': 'Giriş', '/team': 'Giriş',
  '/dashboard': 'Finans', '/reports': 'Finans',
  '/activities': 'Yönetim', '/contractors': 'Yönetim', '/customers': 'Yönetim',
  '/users': 'Yönetim', '/locks': 'Yönetim', '/audit': 'Yönetim',
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Aktivite Giriş';
  const section = SECTIONS[loc.pathname];
  const extras = useHeader((s) => s.extras);
  const { wizardOpen, closeWizard, bulkAIOpen, closeBulkAI } = useQuickEntry();
  const toggleSpotlight = useSpotlight((s) => s.toggle);
  const toggleAssistant = useAssistant((s) => s.toggle);
  const assistantOpen = useAssistant((s) => s.open);

  // ⌘K → Spotlight
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSpotlight();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSpotlight]);

  return (
    <div className="min-h-screen">
      <div className="bg-blobs">
        <div className="bg-blob b1" />
        <div className="bg-blob b2" />
        <div className="bg-blob b3" />
      </div>

      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <main className="lg:pl-64 min-h-screen flex flex-col">
        {/* Topbar — başlık solda; sayfa kontrolleri (extras) sağda (masaüstü) */}
        <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-xl border-b border-paper-3/80 min-h-14 py-2 flex items-center justify-between gap-3 px-4 sm:px-7 lg:px-9">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl bg-paper-2 border border-paper-3 flex items-center justify-center text-ink-2 flex-shrink-0"
              aria-label="Menüyü aç"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-baseline gap-2 min-w-0">
              {section && <span className="text-[10px] font-bold tracking-[.14em] text-ink-4 uppercase hidden sm:inline">{section}</span>}
              <span className="text-base sm:text-lg font-extrabold tracking-tight truncate">{title}</span>
            </div>
          </div>
          {extras && <div className="hidden lg:flex items-center gap-2 min-w-0 overflow-x-auto">{extras}</div>}
        </header>

        <div className="flex-1 px-4 sm:px-6 lg:px-9 py-4 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* AI Asistan — yuvarlak FAB (sohbet kapalıyken) */}
      {!assistantOpen && (
        <button
          onClick={toggleAssistant}
          className="fixed bottom-5 right-5 z-[130] w-14 h-14 rounded-full bg-grad-primary text-white shadow-glow flex items-center justify-center hover:-translate-y-1 transition-transform"
          style={{ backgroundSize: '200% 200%' }}
          title="AI Asistan"
          aria-label="AI Asistan"
        >
          <Sparkles size={22} />
        </button>
      )}

      <QuickEntryWizard open={wizardOpen} onClose={closeWizard} />
      <BulkAIEntry open={bulkAIOpen} onClose={closeBulkAI} />
      <Spotlight />
      <AssistantChat />

      <ToastHost />
    </div>
  );
}
