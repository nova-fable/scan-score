import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="mt-1 text-xs text-zinc-400">{hint}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const info = useQuery({ queryKey: ["appInfo"], queryFn: () => api.getAppInfo() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });

  const [enginePath, setEnginePath] = useState("");
  const [pdfiumPath, setPdfiumPath] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setEnginePath(settings.data.find((s) => s.key === "engine_path")?.value ?? "");
      setPdfiumPath(settings.data.find((s) => s.key === "pdfium_path")?.value ?? "");
    }
  }, [settings.data]);

  const save = async (key: string, value: string) => {
    await api.setSetting(key, value.trim());
    queryClient.invalidateQueries({ queryKey: ["appInfo"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    setSavedMsg("已保存");
    setTimeout(() => setSavedMsg(null), 2000);
  };

  return (
    <div className="h-full overflow-auto bg-zinc-50 p-6">
      <h1 className="text-lg font-semibold">设置</h1>
      {savedMsg && (
        <div className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
          {savedMsg}
        </div>
      )}

      <div className="mt-4 grid max-w-2xl gap-4">
        <Row
          label="识别引擎 (Audiveris)"
          hint="留空则自动探测：打包内置 → /Applications/Audiveris.app → 环境变量 AUDIVERIS_CMD。可指定启动器路径（如 /Applications/Audiveris.app/Contents/MacOS/Audiveris）。"
        >
          <div className="flex gap-2">
            <input
              value={enginePath}
              onChange={(e) => setEnginePath(e.target.value)}
              placeholder="自动探测"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => save("engine_path", enginePath)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
            >
              保存
            </button>
          </div>
          <div className="mt-2 text-xs">
            当前状态：
            {info.data ? (
              info.data.engineFound ? (
                <span className="text-emerald-600">已找到 ✓ {info.data.enginePath}</span>
              ) : (
                <span className="text-red-500">未找到 ✗（请安装 Audiveris 或填写路径）</span>
              )
            ) : (
              "检测中…"
            )}
          </div>
        </Row>

        <Row
          label="pdfium 动态库路径"
          hint="用于 PDF 光栅化与封面生成。留空自动探测：PDFIUM_DYLIB 环境变量 → 应用资源 → 可执行文件目录。"
        >
          <div className="flex gap-2">
            <input
              value={pdfiumPath}
              onChange={(e) => setPdfiumPath(e.target.value)}
              placeholder="自动探测"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => save("pdfium_path", pdfiumPath)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
            >
              保存
            </button>
          </div>
          <div className="mt-2 text-xs">
            当前状态：
            {info.data ? (
              info.data.pdfiumFound ? (
                <span className="text-emerald-600">已绑定 ✓</span>
              ) : (
                <span className="text-amber-600">未绑定（PDF 封面/页数功能不可用）</span>
              )
            ) : (
              "检测中…"
            )}
          </div>
        </Row>

        <Row label="数据目录" hint="曲库数据库与乐谱文件存放位置">
          <code className="block break-all rounded bg-zinc-100 px-2 py-1.5 text-xs text-zinc-600">
            {info.data?.dataDir ?? "…"}
          </code>
        </Row>
      </div>
    </div>
  );
}
