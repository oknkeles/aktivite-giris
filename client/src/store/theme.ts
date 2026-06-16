import { create } from 'zustand';

type Theme = 'light' | 'dark';

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

const initial: Theme = (localStorage.getItem('aktivite_theme') as Theme) || 'light';
apply(initial);

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: initial,
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('aktivite_theme', next);
    apply(next);
    set({ theme: next });
  },
}));
