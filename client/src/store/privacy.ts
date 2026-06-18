import { create } from 'zustand';

const KEY = 'aktivite_mask';

// Tutar maskeleme — varsayılan AÇIK (maskeli). Kullanıcı "göster" derse açılır.
// Tercih tarayıcıda kalıcı; güvenlik için varsayılan gizli.
const stored = localStorage.getItem(KEY);

interface PrivacyState {
  masked: boolean;
  toggle: () => void;
}

export const usePrivacy = create<PrivacyState>((set, get) => ({
  masked: stored !== 'off', // 'off' kaydedilmedikçe maskeli
  toggle: () => {
    const next = !get().masked;
    localStorage.setItem(KEY, next ? 'on' : 'off');
    set({ masked: next });
  },
}));
