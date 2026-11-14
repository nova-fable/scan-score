import { useUi } from "../stores/ui";
import { IconClose } from "./icons";

/// 全局底部 toast(墨绿油墨深条,纸上专色金动作);可携带「撤销」类动作。
/// 悬停暂停计时、可手动关闭——长提示(撤销窗口)读不完就被清掉是纯损耗。
export default function Toast() {
  const toast = useUi((s) => s.toast);
  const pauseToast = useUi((s) => s.pauseToast);
  const resumeToast = useUi((s) => s.resumeToast);
  const dismissToast = useUi((s) => s.dismissToast);
  if (!toast) return null;
  return (
    <div
      className="anim-toast-in fixed bottom-4 left-1/2 z-40 w-max max-w-md -translate-x-1/2"
      role="status"
      aria-live="polite"
      onMouseEnter={pauseToast}
      onMouseLeave={resumeToast}
    >
      <div className="flex items-center gap-3 rounded-lg bg-ink-deep px-4 py-2 text-sm text-paper shadow-lg">
        <span>{toast.message}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={toast.onAction}
            className="shrink-0 text-xs font-semibold text-gold hover:brightness-110"
          >
            {toast.actionLabel}
          </button>
        )}
        <button
          onClick={dismissToast}
          aria-label="关闭提示"
          className="shrink-0 text-paper/50 hover:text-paper"
        >
          <IconClose size={12} />
        </button>
      </div>
    </div>
  );
}
