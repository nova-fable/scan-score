import { create } from "zustand";

export type View = "library" | "detail" | "settings";

interface UiState {
  view: View;
  scoreId: string | null;
  openLibrary: () => void;
  openScore: (id: string) => void;
  openSettings: () => void;
}

export const useUi = create<UiState>((set) => ({
  view: "library",
  scoreId: null,
  openLibrary: () => set({ view: "library", scoreId: null }),
  openScore: (id) => set({ view: "detail", scoreId: id }),
  openSettings: () => set({ view: "settings" }),
}));
