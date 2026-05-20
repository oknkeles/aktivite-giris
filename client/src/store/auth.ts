import { create } from 'zustand';
import { api, type User } from '../api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, fullname: string, password: string) => Promise<void>;
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
    set({ user: data.user, token: data.token, loading: false });
  },

  register: async (username, fullname, password) => {
    await api.post('/auth/register', { username, fullname, password });
  },

  logout: () => {
    localStorage.removeItem('aktivite_token');
    set({ user: null, token: null });
  },

  initFromStorage: async () => {
    const token = localStorage.getItem('aktivite_token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, token, loading: false });
    } catch {
      localStorage.removeItem('aktivite_token');
      set({ user: null, token: null, loading: false });
    }
  },
}));

export const isAdmin = (user: User | null) => user?.role === 'admin';
