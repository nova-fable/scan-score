import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUi } from "./stores/ui";
import { events } from "./lib/tauri";
import LibraryPage from "./pages/LibraryPage";
import ScoreDetailPage from "./pages/ScoreDetailPage";
import SettingsPage from "./pages/SettingsPage";
import Toast from "./components/Toast";
import ShortcutsDialog from "./components/ShortcutsDialog";

/// 侧栏 = 书的封面:深墨绿油墨底、奶油字、烫金双细线。
/// 主区 = 内页:奶油纸面,左缘一道书脊装订阴影。
function Sidebar({ onOpenHelp }: { onOpenHelp: () => void }) {
  const { view, openLibrary, openSettings } = useUi();
  return (
    <aside className="on-ink flex w-56 shrink-0 flex-col bg-ink-deep px-5 pb-5 pt-7 text-paper">
      <div className="flex items-center gap-2.5">
        <img src="/app-icon.png" alt="" className="h-9 w-9 shrink-0" />
        <div>
          <div className="font-disp text-[21px] font-black leading-none tracking-wide">
            ScanScore
          </div>
          <div className="mt-1.5 text-[10.5px] font-semibold tracking-[0.3em] text-ink-faint">
            扫描 · 识别 · 播放
          </div>
        </div>
      </div>
      <div className="mt-4 border-t-4 border-double border-gold/45" />
      <nav className="mt-6 flex flex-col gap-1.5">
        <button
          onClick={openLibrary}
          className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
            view !== "settings"
              ? "bg-paper/15 text-paper shadow-[inset_3px_0_0_0_#f7f1de]"
              : "text-ink-faint hover:bg-ink-bright"
          }`}
        >
          曲库
        </button>
        <button
          onClick={openSettings}
          className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold ${
            view === "settings"
              ? "bg-paper/15 text-paper shadow-[inset_3px_0_0_0_#f7f1de]"
              : "text-ink-faint hover:bg-ink-bright"
          }`}
        >
          设置
        </button>
      </nav>
      <div className="mt-auto">
        <button
          onClick={onOpenHelp}
          title="快捷键说明（按 ?）"
          className="text-xs text-ink-faint hover:text-gold"
        >
          快捷键（<span className="text-gold">?</span>）
        </button>
        <div className="mt-1.5 text-[10.5px] leading-relaxed text-ink-faint">
          OMR: Audiveris · 渲染播放: alphaTab
        </div>
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
      <main className="flex min-w-0 flex-1 flex-col shadow-[inset_12px_0_16px_-12px_rgba(28,36,32,0.4)]">
        {view === "library" && <LibraryPage />}
        {view === "detail" && scoreId && <ScoreDetailPage key={scoreId} scoreId={scoreId} />}
        {view === "settings" && <SettingsPage />}
      </main>
      <Toast />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
