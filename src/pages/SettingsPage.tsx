import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

const VLM_PROVIDERS = [
  { name: "智谱 GLM", base: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4.6v", "glm-4v-plus"] },
  { name: "DeepSeek", base: "https://api.deepseek.com/v1", models: ["deepseek-flash", "deepseek-chat"] },
  { name: "硅基流动 SiliconFlow", base: "https://api.siliconflow.cn/v1", models: [] },
  { name: "Moonshot Kimi", base: "https://api.moonshot.cn/v1", models: ["kimi-latest"] },
  { name: "阿里通义 Qwen", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-vl-max"] },
  { name: "OpenAI", base: "https://api.openai.com/v1", models: ["gpt-4o"] },
  { name: "Ollama（本地）", base: "http://localhost:11434/v1", models: [] },
  { name: "自定义", base: "", models: [] },
];

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
  const [vlmProvider, setVlmProvider] = useState("");
  const [vlmBase, setVlmBase] = useState("");
  const [vlmKey, setVlmKey] = useState("");
  const [vlmModel, setVlmModel] = useState("");
  const [vlmModels, setVlmModels] = useState<string[]>([]);
  const [vlmThinking, setVlmThinking] = useState("on");
  const [vlmTest, setVlmTest] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) {
      setEnginePath(settings.data.find((s) => s.key === "engine_path")?.value ?? "");
      setVlmBase(settings.data.find((s) => s.key === "vlm_api_base")?.value ?? "");
      setVlmKey(settings.data.find((s) => s.key === "vlm_api_key")?.value ?? "");
      setVlmModel(settings.data.find((s) => s.key === "vlm_model")?.value ?? "");
      setVlmThinking(settings.data.find((s) => s.key === "vlm_thinking")?.value ?? "on");
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
          hint="开源 OMR 无法识别六线谱。配置视觉大模型后，检测到六线谱输入时自动改用 AI 转录（需联网，按调用量计费）。兼容 OpenAI chat/completions 协议。"
        >
          <div className="grid gap-2">
            <select
              value={vlmProvider}
              onChange={(e) => {
                const name = e.target.value;
                setVlmProvider(name);
                const p = VLM_PROVIDERS.find((x) => x.name === name);
                if (p) {
                  if (p.base) setVlmBase(p.base);
                  if (p.models.length) setVlmModel(p.models[0]);
                }
              }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none"
            >
              <option value="">选择服务商（自动填 API Base）</option>
              {VLM_PROVIDERS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={vlmBase}
              onChange={(e) => setVlmBase(e.target.value)}
              placeholder="API Base"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <input
                type="password"
                value={vlmKey}
                onChange={(e) => setVlmKey(e.target.value)}
                placeholder="API Key"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <ModelCombobox value={vlmModel} onChange={setVlmModel} options={vlmModels} />
              <button
                onClick={async () => {
                  setVlmTest("获取模型列表中…");
                  try {
                    const models = await api.fetchVlmModels(vlmBase, vlmKey);
                    setVlmModels(models);
                    setVlmTest(`获取到 ${models.length} 个模型，点模型框右侧 ▾ 选择`);
                  } catch (e) {
                    setVlmTest(`该平台不支持列表接口（${String(e).slice(0, 80)}…），可手动输入模型名`);
                  }
                }}
                className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                获取模型列表
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              推理模式
              <select
                value={vlmThinking}
                onChange={(e) => setVlmThinking(e.target.value)}
                className="rounded border border-zinc-200 px-2 py-1"
              >
                <option value="on">允许推理（更准，更慢更贵）</option>
                <option value="off">关闭推理（更快更省）</option>
              </select>
              <span className="text-zinc-400">输出预算已自动放大到 32k tokens</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await api.setSetting("vlm_api_base", vlmBase);
                  await api.setSetting("vlm_model", vlmModel);
                  await api.setSetting("vlm_thinking", vlmThinking);
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
                  vlmTest.startsWith("测试中") || vlmTest.startsWith("连通") || vlmTest.startsWith("获取到")
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

/// 模型选择组合框：输入框可手动输入，▾ 展开完整列表（不按已填值过滤）
function ModelCombobox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <div className="flex">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="模型"
          className="w-40 rounded-l-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-r-lg border border-l-0 border-zinc-200 px-2 text-xs text-zinc-500 hover:bg-zinc-50"
          title="展开模型列表"
        >
          ▾
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-60 w-72 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">
                列表为空——先点「获取模型列表」，或直接手动输入
              </div>
            ) : (
              options.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                  }}
                  className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                    m === value ? "font-medium text-indigo-600" : "text-zinc-700"
                  }`}
                >
                  {m}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
