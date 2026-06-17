import { create } from 'zustand';

interface AssistantState {
  open: boolean;
  setOpen: (b: boolean) => void;
  toggle: () => void;
}

export const useAssistant = create<AssistantState>((set, get) => ({
  open: false,
  setOpen: (b) => set({ open: b }),
  toggle: () => set({ open: !get().open }),
}));
