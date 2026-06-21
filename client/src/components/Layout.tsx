import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Search as SearchIcon, Sparkles, Eye, EyeOff, Menu } from 'lucide-react';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import { useAuth, isAdmin } from '../store/auth';
import { usePrivacy } from '../store/privacy';
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

// Başlığın altındaki kısa açıklama
const SUBTITLES: Record<string, string> = {
  '/timesheet': 'Günlük çalışmanı takvim üzerinden kaydet',
  '/entries': 'Tüm aktivite kayıtlarını gör ve yönet',
  '/team': 'Ekibin aylık doluluğunu tek ekranda izle',
  '/dashboard': 'Ayın özeti, müşteri dağılımı ve trend',
  '/reports': 'Müşteri bazında saat ve tutar raporları',
  '/activities': 'Aktivite türlerini ve birimlerini yönet',
  '/contractors': 'Yüklenici bilgilerini ve iskontoları yönet',
  '/customers': 'Müşteri, fiyat ve para birimi bilgileri',
  '/users': 'Kullanıcıları ve yetkilerini yönet',
  '/locks': 'Mutabakat gönderilen dönemleri kilitle',
  '/audit': 'Önemli aksiyonların kim/ne zaman izi',
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Aktivite Giriş';
  const section = SECTIONS[loc.pathname];
  const subtitle = SUBTITLES[loc.pathname];
  const extras = useHeader((s) => s.extras);
  const { wizardOpen, closeWizard, bulkAIOpen, closeBulkAI } = useQuickEntry();
  const toggleSpotlight = useSpotlight((s) => s.toggle);
  const toggleAssistant = useAssistant((s) => s.toggle);
  const admin = isAdmin(useAuth((s) => s.user));
  const { masked, toggle: toggleMask } = usePrivacy();

  // Cmd+K / Ctrl+K → Spotlight (komut paleti)
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
      {/* Animated background blobs */}
      <div className="bg-blobs">
        <div className="bg-blob b1" />
        <div className="bg-blob b2" />
        <div className="bg-blob b3" />
      </div>

      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <main className="lg:pl-64 min-h-screen flex flex-col">
        {/* Topbar — bölüm etiketi + başlık + açıklama solda, sayfa aksiyonları sağda */}
        <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-xl border-b border-paper-3/80 min-h-16 sm:min-h-[72px] py-2.5 flex items-center justify-between gap-3 px-5 sm:px-7 lg:px-9 shadow-[0_1px_0_rgba(15,23,42,.02)]">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobil menü tetikleyici */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl bg-paper-2 border border-paper-3 flex items-center justify-center text-ink-2 flex-shrink-0"
              aria-label="Menüyü aç"
            >
              <Menu size={18} />
            </button>
            <div className="flex-shrink-0 min-w-0">
              {section && (
                <div className="text-[10px] font-bold tracking-[.14em] text-ink-4 uppercase leading-none mb-1 hidden sm:block">{section}</div>
              )}
              <div className="text-base sm:text-xl font-extrabold tracking-tight leading-tight truncate">{title}</div>
              {subtitle && (
                <div className="text-[12px] text-ink-3 mt-0.5 truncate hidden lg:block">{subtitle}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            {extras && <div className="flex items-center gap-2 min-w-0 overflow-x-auto">{extras}</div>}
            {/* Tutar maskeleme anahtarı (admin) */}
            {admin && (
              <button
                onClick={toggleMask}
                className={clsx(
                  'flex items-center gap-1.5 rounded-xl pl-2.5 pr-3 py-2 text-xs font-bold border transition flex-shrink-0',
                  masked
                    ? 'bg-paper-2 border-paper-3 text-ink-3 hover:text-ink'
                    : 'bg-brand-emerald/10 border-brand-emerald/30 text-brand-emerald'
                )}
                title={masked ? 'Tutarları göster' : 'Tutarları gizle'}
              >
                {masked ? <EyeOff size={15} /> : <Eye size={15} />}
                <span className="hidden lg:inline">{masked ? 'Tutarlar gizli' : 'Tutarlar açık'}</span>
              </button>
            )}
            {/* Spotlight tetikleyici */}
            <button
              onClick={toggleSpotlight}
              className="hidden sm:flex items-center gap-2 text-ink-3 hover:text-ink bg-paper-2 hover:bg-paper-3/60 border border-paper-3 rounded-xl pl-3 pr-2 py-2 transition flex-shrink-0"
              title="Komut paleti (⌘K)"
            >
              <SearchIcon size={15} />
              <span className="text-[12px] hidden md:inline">Ara…</span>
              <kbd className="text-[10px] font-mono bg-surface border border-paper-3 rounded px-1.5 py-0.5 hidden md:inline">⌘K</kbd>
            </button>
            {/* AI Asistan */}
            <button
              onClick={toggleAssistant}
              className="flex items-center gap-1.5 bg-grad-primary text-white rounded-xl px-2.5 sm:px-3 py-2 text-xs font-bold shadow-glow hover:-translate-y-0.5 transition flex-shrink-0"
              title="AI Asistan"
            >
              <Sparkles size={15} />
              <span className="hidden md:inline">Asistan</span>
            </button>
          </div>
        </header>

        {/* Content fills available width — max constrained to 1600px for ultra-wide screens */}
        <div className="flex-1 px-4 sm:px-6 lg:px-9 py-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* FAB kaldırıldı — sayfa içindeki Hızlı Kayıt butonu + ⌘K yeterli */}

      <QuickEntryWizard open={wizardOpen} onClose={closeWizard} />
      <BulkAIEntry open={bulkAIOpen} onClose={closeBulkAI} />
      <Spotlight />
      <AssistantChat />

      <ToastHost />
    </div>
  );
}
