import { useDialog } from "../lib/useDialog";
import { IconClose } from "./icons";
import { useT } from "../lib/i18n";

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "空格", desc: "播放 / 暂停（曲谱详情页）" },
  { keys: "← / →", desc: "快退 / 快进 5 秒" },
  { keys: "M", desc: "节拍器开 / 关（详情页）" },
  { keys: "L", desc: "循环播放开 / 关（详情页）" },
  { keys: "1-9", desc: "跳到第 n 小节（详情页）" },
  { keys: "Shift + 滚轮", desc: "横向滚动谱面" },
  { keys: "Esc", desc: "关闭弹窗 · 退出编辑 · 逐层退出" },
  { keys: "Enter", desc: "保存元数据（编辑态）" },
  { keys: "⌘F / Ctrl+F", desc: "聚焦曲库搜索" },
  { keys: "⌘V / Ctrl+V", desc: "粘贴剪贴板图片导入（曲库页）" },
  { keys: "Shift + 点击", desc: "范围多选曲谱" },
  { keys: "?", desc: "打开本说明" },
];

/// 快捷键说明(Help 层,扉页式奶油纸卡):侧栏入口 + 全局 ? 键呼出
export default function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div
      className="anim-fade-in fixed inset-0 z-30 grid place-items-center bg-black/40"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="快捷键说明"
        className="anim-pop-in w-[480px] rounded-xl border border-hair bg-paper-bright p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-disp text-base font-bold text-bind">{t("快捷键")}</div>
          <button
            onClick={onClose}
            aria-label="关闭快捷键说明"
            className="text-bind/40 transition hover:text-bind"
          >
            <IconClose size={13} />
          </button>
        </div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} className="border-b border-hair last:border-0">
                <td className="whitespace-nowrap py-2 pr-4 align-top">
                  <kbd className="rounded-md border border-hair-strong bg-paper-dim px-2 py-0.5 text-xs text-bind">
                    {s.keys}
                  </kbd>
                </td>
                <td className="py-2 text-bind/80">{t(s.desc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-5 text-bind/60">
          快捷键在对应页面生效；输入框内输入时不响应。A-B
          循环：播放到目标位置时依次按播放条上的 A、B。
        </p>
      </div>
    </div>
  );
}
