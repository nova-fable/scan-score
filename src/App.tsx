import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUi } from "./stores/ui";
import { events } from "./lib/tauri";
import LibraryPage from "./pages/LibraryPage";
import ScoreDetailPage from "./pages/ScoreDetailPage";
import SettingsPage from "./pages/SettingsPage";
import Toast from "./components/Toast";
import ShortcutsDialog from "./components/ShortcutsDialog";

function Sidebar({ onOpenHelp }: { onOpenHelp: () => void }) {
  const { view, openLibrary, openSettings } = useUi();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/app-icon.png" alt="" className="h-9 w-9 shrink-0" />
        <div>
          <div className="text-sm font-semibold">ScanScore</div>
          <div className="text-xs text-zinc-500">曲谱扫描与播放</div>
        </div>
      </div>
      <nav className="mt-2 flex flex-col gap-1 px-2">
        <button
          onClick={openLibrary}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            view !== "settings"
              ? "bg-indigo-50 font-semibold text-indigo-700"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          曲库
        </button>
        <button
          onClick={openSettings}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            view === "settings"
              ? "bg-indigo-50 font-semibold text-indigo-700"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          设置
        </button>
      </nav>
      <div className="mt-auto px-4 pb-3 pt-2">
        <button
          onClick={onOpenHelp}
          title="快捷键说明（按 ?）"
          className="text-xs text-zinc-500 hover:text-indigo-600"
        >
          快捷键（?）
        </button>
        <div className="mt-1 text-xs text-zinc-500">OMR: Audiveris · 渲染播放: alphaTab</div>
      </div>
    </aside>
  );
}

export default function App() {
  const { view, scoreId } = useUi();
  const showToast = useUi((s) => s.showToast);
  const queryClient = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);

  // 识别事件 → 刷新数据 + 完成时刻反馈（否则用户在别的页面时无声无息）
  useEffect(() => {
    const unlistenP = events.onOmrProgress(() => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    });
    const unlistenD = events.onOmrDone((e) => {
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      queryClient.invalidateQueries({ queryKey: ["score"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      const t = e.score?.title;
      if (!t) return;
      if (e.ok) showToast({ message: `识别完成「${t}」，可播放` });
      else showToast({ message: `识别失败「${t}」：${e.error ?? "未知错误"}` }, 6000);
    });
    return () => {
      unlistenP.then((f) => f());
      unlistenD.then((f) => f());
    };
  }, [queryClient, showToast]);

  // ? 呼出快捷键说明（输入时除外）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" && e.key !== "？") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          t instanceof HTMLSelectElement ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setHelpOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar onOpenHelp={() => setHelpOpen(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        {view === "library" && <LibraryPage />}
        {view === "detail" && scoreId && <ScoreDetailPage key={scoreId} scoreId={scoreId} />}
        {view === "settings" && <SettingsPage />}
      </main>
      <Toast />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
