import { create } from 'zustand';
import type { ReactNode } from 'react';

interface HeaderState {
  extras: ReactNode | null;
  setExtras: (node: ReactNode | null) => void;
}

// Pages can inject custom content into the Layout topbar (next to the page title).
// Useful for page-specific actions like month navigation.
export const useHeader = create<HeaderState>((set) => ({
  extras: null,
  setExtras: (extras) => set({ extras }),
}));
