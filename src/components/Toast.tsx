import { useUi } from "../stores/ui";

/// 全局底部 toast（深色 pill，DESIGN.md 规格）；可携带「撤销」类动作
export default function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      className="anim-toast-in fixed bottom-4 left-1/2 z-40 w-max max-w-md -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white shadow">
        <span>{toast.message}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={toast.onAction}
            className="shrink-0 text-xs text-indigo-300 hover:text-indigo-200"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
