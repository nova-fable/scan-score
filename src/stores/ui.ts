import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export type View = "library" | "detail" | "settings";

export interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface UiState {
  view: View;
  scoreId: string | null;
  toast: ToastState | null;
  /// 待落盘的软删除曲谱 id：已从列表隐藏，30 秒后真正删除，期间可撤销
  pendingDeleteIds: string[];
  /// 删除正在落盘（此间撤销不可用）
  deletingNow: boolean;
  openLibrary: () => void;
  openScore: (id: string) => void;
  openSettings: () => void;
  showToast: (toast: ToastState, durationMs?: number) => void;
  dismissToast: () => void;
  softDeleteScores: (ids: string[], label: string, queryClient: QueryClient) => void;
  undoPendingDelete: () => void;
}

let toastTimer: number | undefined;
let deleteTimer: number | undefined;
let pendingQueryClient: QueryClient | null = null;

/// 把当前待删的曲谱真正落盘并刷新查询
async function flushPendingDelete() {
  const ids = useUi.getState().pendingDeleteIds;
  if (deleteTimer !== undefined) {
    clearTimeout(deleteTimer);
    deleteTimer = undefined;
  }
  useUi.setState({ pendingDeleteIds: [], deletingNow: true });
  if (!ids.length) {
    useUi.setState({ deletingNow: false });
    return;
  }
  try {
    await Promise.all(ids.map((id) => api.deleteScore(id)));
  } finally {
    pendingQueryClient?.invalidateQueries({ queryKey: ["scores"] });
    pendingQueryClient?.invalidateQueries({ queryKey: ["score"] });
    pendingQueryClient?.invalidateQueries({ queryKey: ["jobs"] });
    useUi.setState({ deletingNow: false });
  }
}

export const useUi = create<UiState>((set, get) => ({
  view: "library",
  scoreId: null,
  toast: null,
  pendingDeleteIds: [],
  deletingNow: false,
  openLibrary: () => set({ view: "library", scoreId: null }),
  openScore: (id) => set({ view: "detail", scoreId: id }),
  openSettings: () => set({ view: "settings" }),
  showToast: (toast, durationMs = 4000) => {
    if (toastTimer !== undefined) clearTimeout(toastTimer);
    set({ toast });
    if (durationMs > 0) {
      toastTimer = window.setTimeout(() => set({ toast: null }), durationMs);
    }
  },
  dismissToast: () => {
    if (toastTimer !== undefined) {
      clearTimeout(toastTimer);
      toastTimer = undefined;
    }
    set({ toast: null });
  },
  softDeleteScores: (ids, label, queryClient) => {
    pendingQueryClient = queryClient;
    // 上一批还没落盘就直接落盘，避免堆积
    void flushPendingDelete();
    set({ pendingDeleteIds: ids });
    deleteTimer = window.setTimeout(() => {
      deleteTimer = undefined;
      void flushPendingDelete();
    }, 30000);
    get().showToast(
      {
        message: `已删除 ${label}`,
        actionLabel: "撤销",
        onAction: () => get().undoPendingDelete(),
      },
      30000,
    );
  },
  undoPendingDelete: () => {
    // 落盘已开始，撤销通道关闭——诚实提示而不是假成功
    if (get().deletingNow) {
      get().showToast({ message: "正在删除，无法撤销" }, 2500);
      return;
    }
    if (deleteTimer !== undefined) {
      clearTimeout(deleteTimer);
      deleteTimer = undefined;
    }
    set({ pendingDeleteIds: [] });
    get().dismissToast();
    get().showToast({ message: "已撤销删除" }, 2000);
  },
}));
