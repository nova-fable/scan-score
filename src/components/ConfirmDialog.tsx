import { useDialog } from "../lib/useDialog";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/// 统一确认模态（DESIGN.md 420px 规格）：标题 + 说明 + 危险红色确认 + 取消。
/// window.confirm 在 wry/WKWebView 不可用，一切确认走这里。
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "删除",
  cancelLabel = "取消",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useDialog(open, onCancel);
  if (!open) return null;
  return (
    <div className="anim-fade-in fixed inset-0 z-40 grid place-items-center bg-black/40">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-pop-in w-[420px] rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-sm leading-5 text-zinc-500">{message}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-red-500 px-4 py-1.5 text-sm text-white hover:bg-red-600 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
