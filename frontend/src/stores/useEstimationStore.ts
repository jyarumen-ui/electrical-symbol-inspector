import { create } from "zustand";
import type { EstimationItem, EstimationSummary } from "../types";

interface EstimationStore {
  summary: EstimationSummary | null;
  setSummary: (s: EstimationSummary) => void;
  updateItem: (id: string, patch: Partial<EstimationItem>) => void;
}

export const useEstimationStore = create<EstimationStore>((set) => ({
  summary: null,

  setSummary: (summary) => set({ summary }),

  updateItem: (id, patch) =>
    set((s) => {
      if (!s.summary) return s;
      const update = (list: EstimationItem[]) =>
        list.map((item) => (item.id === id ? { ...item, ...patch } : item));
      return {
        summary: {
          ...s.summary,
          confirmed_items: update(s.summary.confirmed_items),
          pending_items: update(s.summary.pending_items),
        },
      };
    }),
}));
