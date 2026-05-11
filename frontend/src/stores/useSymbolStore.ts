import { create } from "zustand";
import type { SymbolHit } from "../types";

interface SymbolStore {
  hits: SymbolHit[];
  dirtyIds: Set<string>;
  confidenceThreshold: number;
  setHits: (hits: SymbolHit[]) => void;
  updateHit: (id: string, patch: Partial<SymbolHit>) => void;
  markDirty: (id: string) => void;
  clearDirty: () => void;
  setThreshold: (v: number) => void;
}

export const useSymbolStore = create<SymbolStore>((set) => ({
  hits: [],
  dirtyIds: new Set(),
  confidenceThreshold: 0.75,

  setHits: (hits) => set({ hits }),

  updateHit: (id, patch) =>
    set((s) => ({
      hits: s.hits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      dirtyIds: new Set([...s.dirtyIds, id]),
    })),

  markDirty: (id) =>
    set((s) => ({ dirtyIds: new Set([...s.dirtyIds, id]) })),

  clearDirty: () => set({ dirtyIds: new Set() }),

  setThreshold: (v) => set({ confidenceThreshold: v }),
}));
