import { create } from 'zustand';
import { api, type User } from '../api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  initFromStorage: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('aktivite_token'),
  loading: true,

  login: async (username, password) => {
    const data = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
    localStorage.setItem('aktivite_token', data.token);
    localStorage.setItem('aktivite_user', JSON.stringify(data.user));
    set({ user: data.user, token: data.token, loading: false });
  },

  logout: () => {
    localStorage.removeItem('aktivite_token');
    localStorage.removeItem('aktivite_user');
    set({ user: null, token: null });
  },

  initFromStorage: async () => {
    const token = localStorage.getItem('aktivite_token');
    if (!token) {
      set({ loading: false });
      return;
    }

    // Hızlı açılış: kullanıcıyı cache'ten hemen yükle — ekran beklemeden render olur,
    // veri sorguları /me doğrulamasıyla PARALEL gider (seri 2 tur yerine 1 tur).
    const cached = localStorage.getItem('aktivite_user');
    if (cached) {
      try {
        set({ user: JSON.parse(cached) as User, token, loading: false });
      } catch {
        localStorage.removeItem('aktivite_user');
      }
    }

    // Arka planda token'ı doğrula — geçersizse (silinmiş kullanıcı, süresi dolmuş
    // token) çıkış yap; geçerliyse güncel kullanıcı bilgisini yaz (rol değişmiş olabilir).
    try {
      const user = await api.get<User>('/auth/me');
      localStorage.setItem('aktivite_user', JSON.stringify(user));
      set({ user, token, loading: false });
    } catch {
      localStorage.removeItem('aktivite_token');
      localStorage.removeItem('aktivite_user');
      set({ user: null, token: null, loading: false });
    }
  },
}));

export const isAdmin = (user: User | null) => user?.role === 'admin';
export const isPy = (user: User | null) => user?.role === 'py';
// PY (proje yöneticisi) tüm veriyi OKUYABİLİR (raporlar, tutarlar, herkesin kaydı)
// ama yönetim ekranları (kullanıcı/müşteri/rate/kilit) admin'e özeldir.
export const canReadAll = (user: User | null) => user?.role === 'admin' || user?.role === 'py';
