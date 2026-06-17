import { create } from 'zustand';

interface SpotlightState {
  open: boolean;
  setOpen: (b: boolean) => void;
  toggle: () => void;
}

// Spotlight / komut paleti — ⌘K ile açılır.
export const useSpotlight = create<SpotlightState>((set, get) => ({
  open: false,
  setOpen: (b) => set({ open: b }),
  toggle: () => set({ open: !get().open }),
}));
