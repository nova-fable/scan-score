import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUi } from "./stores/ui";
import { events } from "./lib/tauri";
import LibraryPage from "./pages/LibraryPage";
import ScoreDetailPage from "./pages/ScoreDetailPage";
import SettingsPage from "./pages/SettingsPage";

function Sidebar() {
  const { view, openLibrary, openSettings } = useUi();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/app-icon.png" alt="" className="h-9 w-9 shrink-0" />
        <div>
          <div className="text-sm font-semibold">ScanScore</div>
          <div className="text-xs text-zinc-400">曲谱扫描与播放</div>
        </div>
      </div>
      <nav className="mt-2 flex flex-col gap-1 px-2">
        <button
          onClick={openLibrary}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            view !== "settings"
              ? "bg-indigo-50 font-medium text-indigo-700"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          曲库
        </button>
        <button
          onClick={openSettings}
          className={`rounded-lg px-3 py-2 text-left text-sm ${
            view === "settings"
              ? "bg-indigo-50 font-medium text-indigo-700"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          设置
        </button>
      </nav>
      <div className="mt-auto px-4 py-3 text-[11px] leading-4 text-zinc-400">
        OMR: Audiveris · 渲染播放: alphaTab
      </div>
    </aside>
  );
}

export default function App() {
  const { view, scoreId } = useUi();
  const queryClient = useQueryClient();

  // 识别事件 → 刷新曲库数据
  useEffect(() => {
    const unlistenP = events.onOmrProgress(() => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    });
    const unlistenD = events.onOmrDone(() => {
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      queryClient.invalidateQueries({ queryKey: ["score"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    });
    return () => {
      unlistenP.then((f) => f());
      unlistenD.then((f) => f());
    };
  }, [queryClient]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {view === "library" && <LibraryPage />}
        {view === "detail" && scoreId && <ScoreDetailPage key={scoreId} scoreId={scoreId} />}
        {view === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
