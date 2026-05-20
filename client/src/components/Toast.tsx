import { create } from 'zustand';
import { useEffect } from 'react';
import clsx from 'clsx';

interface ToastState {
  message: string | null;
  variant: 'success' | 'error' | 'info';
  show: (msg: string, variant?: ToastState['variant']) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  variant: 'success',
  show: (message, variant = 'success') => {
    set({ message, variant });
    setTimeout(() => set({ message: null }), 3200);
  },
  hide: () => set({ message: null }),
}));

export function ToastHost() {
  const { message, variant } = useToast();
  useEffect(() => {}, [message]);
  if (!message) return null;
  return (
    <div
      className={clsx(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl font-bold text-sm text-white shadow-xl animate-fade-in',
        variant === 'success' && 'bg-grad-mint',
        variant === 'error' && 'bg-grad-warm',
        variant === 'info' && 'bg-grad-primary'
      )}
    >
      {message}
    </div>
  );
}

export function confettiBurst() {
  const colors = ['#6366F1', '#A855F7', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9', '#F43F5E'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.35;
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('div');
    const color = colors[i % colors.length];
    p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:8px;height:8px;background:${color};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};`;
    container.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const v = 180 + Math.random() * 280;
    const dx = Math.cos(angle) * v;
    const dy = Math.sin(angle) * v - Math.random() * 180;
    const rot = Math.random() * 1080 - 540;
    p.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px,${dy + 450}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1600 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }
    );
  }
  setTimeout(() => container.remove(), 2600);
}
