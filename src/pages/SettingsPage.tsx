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
  const [vlmBase, setVlmBase] = useState("");
  const [vlmKey, setVlmKey] = useState("");
  const [vlmModel, setVlmModel] = useState("");
  const [vlmTest, setVlmTest] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setEnginePath(settings.data.find((s) => s.key === "engine_path")?.value ?? "");
      setVlmBase(settings.data.find((s) => s.key === "vlm_api_base")?.value ?? "");
      setVlmKey(settings.data.find((s) => s.key === "vlm_api_key")?.value ?? "");
      setVlmModel(settings.data.find((s) => s.key === "vlm_model")?.value ?? "");
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
          label="AI 六线谱识别（实验性）"
          hint="开源 OMR 无法识别六线谱。配置视觉大模型后，检测到六线谱输入时自动改用 AI 转录（需联网，按调用量计费）。兼容 OpenAI chat/completions 协议；智谱示例：API Base https://open.bigmodel.cn/api/paas/v4，模型 glm-4.6v。"
        >
          <div className="grid gap-2">
            <input
              value={vlmBase}
              onChange={(e) => setVlmBase(e.target.value)}
              placeholder="API Base（默认智谱）"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <input
                type="password"
                value={vlmKey}
                onChange={(e) => setVlmKey(e.target.value)}
                placeholder="API Key"
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <input
                value={vlmModel}
                onChange={(e) => setVlmModel(e.target.value)}
                placeholder="模型名"
                className="w-40 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await api.setSetting("vlm_api_base", vlmBase);
                  await api.setSetting("vlm_model", vlmModel);
                  if (vlmKey.trim()) {
                    await api.setSetting("vlm_api_key", vlmKey);
                  }
                  queryClient.invalidateQueries({ queryKey: ["appInfo"] });
                  setSavedMsg("已保存");
                  setTimeout(() => setSavedMsg(null), 2000);
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
              >
                保存
              </button>
              <button
                onClick={async () => {
                  setVlmTest("测试中…");
                  try {
                    const res = await api.testVlmConnection(vlmBase, vlmKey, vlmModel);
                    setVlmTest(res);
                  } catch (e) {
                    setVlmTest(`失败：${String(e)}`);
                  }
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                测试连接
              </button>
            </div>
            {vlmTest && (
              <div
                className={`text-xs ${
                  vlmTest.startsWith("测试中") || vlmTest.startsWith("连通")
                    ? "text-emerald-600"
                    : "text-red-500"
                }`}
              >
                {vlmTest}
              </div>
            )}
          </div>
          <div className="mt-2 text-xs">
            当前状态：
            {info.data ? (
              info.data.vlmConfigured ? (
                <span className="text-emerald-600">已配置 ✓</span>
              ) : (
                <span className="text-zinc-400">未配置（六线谱将提示改用 Guitar Pro 导入）</span>
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
