import { create } from 'zustand';

interface QuickEntryState {
  wizardOpen: boolean;
  bulkAIOpen: boolean;
  openWizard: () => void;
  closeWizard: () => void;
  openBulkAI: () => void;
  closeBulkAI: () => void;
}

/**
 * Hızlı kayıt + AI toplu giriş için ortak state.
 * Layout (FAB + Cmd+K), Timesheet (top butonlar) bu store'u kullanır.
 */
export const useQuickEntry = create<QuickEntryState>((set) => ({
  wizardOpen: false,
  bulkAIOpen: false,
  openWizard: () => set({ wizardOpen: true }),
  closeWizard: () => set({ wizardOpen: false }),
  openBulkAI: () => set({ bulkAIOpen: true }),
  closeBulkAI: () => set({ bulkAIOpen: false }),
}));
