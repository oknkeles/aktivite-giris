import { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  /** İşlem sürerken modalı kilitler (overlay + spinner) */
  busy?: boolean;
  busyLabel?: string;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export default function Modal({ open, onClose, title, children, size = 'md', footer, busy = false, busyLabel = 'İşleniyor…' }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose, busy]);

  if (!open) return null;
  // Backdrop tıklaması kapatmaz — yanlışlıkla veri kaybı olmasın. Sadece X veya ESC.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in"
    >
      <div
        className={clsx('relative bg-surface rounded-3xl shadow-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in', sizes[size])}
      >
        {title && (
          <div className="sticky top-0 bg-surface/90 backdrop-blur-sm flex items-center justify-between p-5 sm:p-6 border-b border-paper-3 z-10">
            <div className="text-lg sm:text-xl font-extrabold tracking-tight">{title}</div>
            <button
              onClick={onClose}
              disabled={busy}
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-3 hover:bg-paper-2 hover:text-ink transition disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-5 sm:p-6">{children}</div>
        {footer && (
          <div className="sticky bottom-0 bg-surface/90 backdrop-blur-sm flex flex-wrap justify-end gap-2 p-4 sm:p-5 border-t border-paper-3">
            {footer}
          </div>
        )}

        {/* İşlem kilidi — kaydet/güncelle sürerken tüm modalı bloke eder */}
        {busy && (
          <div className="absolute inset-0 z-20 bg-surface/70 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-3xl">
            <Loader2 size={30} className="animate-spin text-brand-indigo" />
            <span className="text-sm font-semibold text-ink-2">{busyLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
