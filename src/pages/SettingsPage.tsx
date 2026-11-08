import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import { useUi } from "../stores/ui";
import { useDismissOnEsc } from "../lib/useDialog";
import ConfirmDialog from "../components/ConfirmDialog";

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
      <div className="text-sm font-semibold">{label}</div>
      {hint && <div className="mt-1 text-xs leading-5 text-zinc-500">{hint}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const showToast = useUi((s) => s.showToast);
  const info = useQuery({ queryKey: ["appInfo"], queryFn: () => api.getAppInfo() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });

  const [enginePath, setEnginePath] = useState("");
  const [vlmProvider, setVlmProvider] = useState("");
  const [vlmBase, setVlmBase] = useState("");
  const [vlmKey, setVlmKey] = useState("");
  const [vlmModel, setVlmModel] = useState("");
  const [vlmModels, setVlmModels] = useState<string[]>([]);
  const [vlmThinking, setVlmThinking] = useState("on");
  const [upscaleWidth, setUpscaleWidth] = useState("");
  const [audiverisArgs, setAudiverisArgs] = useState("");
  const [vlmTest, setVlmTest] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [vlmOpen, setVlmOpen] = useState(false);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    if (settings.data) {
      setEnginePath(settings.data.find((s) => s.key === "engine_path")?.value ?? "");
      setVlmProvider(settings.data.find((s) => s.key === "vlm_provider")?.value ?? "");
      setVlmBase(settings.data.find((s) => s.key === "vlm_api_base")?.value ?? "");
      setVlmKey(settings.data.find((s) => s.key === "vlm_api_key")?.value ?? "");
      setVlmModel(settings.data.find((s) => s.key === "vlm_model")?.value ?? "");
      setVlmThinking(settings.data.find((s) => s.key === "vlm_thinking")?.value ?? "on");
      setUpscaleWidth(settings.data.find((s) => s.key === "upscale_width")?.value ?? "");
      setAudiverisArgs(settings.data.find((s) => s.key === "audiveris_args")?.value ?? "");
    }
  }, [settings.data]);

  // 保存反馈走全局 Toast：卡片可能远在视口外，页面顶部的内联提示看不见
  const flashSaved = (msg = "已保存", ms = 2000) => {
    showToast({ message: msg }, ms);
  };

  const save = async (key: string, value: string) => {
    await api.setSetting(key, value.trim());
    queryClient.invalidateQueries({ queryKey: ["appInfo"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    flashSaved();
  };

  return (
    <div className="h-full overflow-auto bg-zinc-50 p-6">
      <h1 className="text-lg font-semibold">设置</h1>

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
              aria-label="Audiveris 启动器路径"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => save("engine_path", enginePath)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
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
                <span className="text-red-600">未找到 ✗（请安装 Audiveris 或填写路径）</span>
              )
            ) : (
              "检测中…"
            )}
          </div>
        </Row>

        {/* 一次性配置项默认折叠，避免最低频的卡片占据最大面积 */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setVlmOpen((v) => !v)}
              aria-expanded={vlmOpen}
              className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold"
            >
              <span>AI 六线谱识别（实验性）</span>
              <span className="shrink-0 text-xs font-normal text-zinc-500">
                {info.data ? (info.data.vlmConfigured ? "· 已配置 ✓" : "· 未配置") : "· 检测中…"}
              </span>
            </button>
            <button
              onClick={() => setVlmOpen((v) => !v)}
              aria-expanded={vlmOpen}
              aria-label={vlmOpen ? "收起 AI 六线谱识别设置" : "展开 AI 六线谱识别设置"}
              className="grid h-6 w-6 shrink-0 place-items-center rounded border border-zinc-200 text-xs text-zinc-500 hover:bg-zinc-50"
            >
              {vlmOpen ? "▴" : "▾"}
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            开源 OMR 无法识别六线谱。配置视觉大模型后，检测到六线谱输入时自动改用 AI
            转录（需联网，按调用量计费）。兼容 OpenAI chat/completions 协议。
          </p>
          {vlmOpen && (
          <div className="mt-3 grid gap-2">
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
              aria-label="选择服务商"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none"
            >
              <option value="">选择服务商（自动填接口地址）</option>
              {VLM_PROVIDERS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={vlmBase}
              onChange={(e) => setVlmBase(e.target.value)}
              placeholder="接口地址 (API Base)"
              aria-label="API 接口地址"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <input
                type="password"
                value={vlmKey}
                onChange={(e) => setVlmKey(e.target.value)}
                placeholder="API Key"
                aria-label="API Key"
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
                aria-label="推理模式"
                className="rounded border border-zinc-200 px-2 py-1"
              >
                <option value="on">允许推理（更准，更慢更贵）</option>
                <option value="off">关闭推理（更快更省）</option>
              </select>
              <span className="text-zinc-500">长输出预算已自动配置，无需手动调整</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await api.setSetting("vlm_api_base", vlmBase);
                  await api.setSetting("vlm_model", vlmModel);
                  await api.setSetting("vlm_thinking", vlmThinking);
                  await api.setSetting("vlm_provider", vlmProvider);
                  if (vlmKey.trim()) {
                    await api.setSetting("vlm_api_key", vlmKey);
                  }
                  queryClient.invalidateQueries({ queryKey: ["appInfo"] });
                  flashSaved();
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
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
              {info.data?.vlmConfigured && !vlmKey.trim() && (
                <button
                  onClick={async () => {
                    await api.setSetting("vlm_api_key", "");
                    queryClient.invalidateQueries({ queryKey: ["appInfo"] });
                    flashSaved("已清除保存的 API Key");
                  }}
                  className="text-xs text-zinc-500 underline hover:text-red-600"
                >
                  清除已保存的 Key
                </button>
              )}
            </div>
            {vlmTest && (
              <div
                className={`text-xs ${
                  vlmTest.startsWith("测试中") || vlmTest.startsWith("连通") || vlmTest.startsWith("获取到")
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}
              >
                {vlmTest}
              </div>
            )}
          </div>
          )}
        </div>

        <Row label="数据目录" hint="曲库数据库与乐谱文件存放位置">
          <code className="block break-all rounded bg-zinc-100 px-2 py-1.5 text-xs text-zinc-600">
            {info.data?.dataDir ?? "…"}
          </code>
        </Row>

        <Row
          label="识别参数"
          hint="低分辨率图片自动放大的目标宽度（谱线间距越大约识别越稳，默认 2400px）；Audiveris 附加命令行参数（留空即可）。"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              放大宽度
              <input
                value={upscaleWidth}
                onChange={(e) => setUpscaleWidth(e.target.value)}
                placeholder="2400"
                aria-label="放大目标宽度"
                className="w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-1 text-xs text-zinc-500">
              附加参数
              <input
                value={audiverisArgs}
                onChange={(e) => setAudiverisArgs(e.target.value)}
                placeholder="留空"
                aria-label="Audiveris 附加参数"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <button
              onClick={async () => {
                await api.setSetting("upscale_width", upscaleWidth);
                await api.setSetting("audiveris_args", audiverisArgs);
                flashSaved();
              }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              保存
            </button>
          </div>
        </Row>

        <Row
          label="备份与恢复"
          hint="备份包含曲库数据库与全部乐谱文件。恢复会覆盖现有数据，完成后需重启应用。"
        >
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const target = await api.pickBackupTarget();
                if (!target) return;
                await api.exportBackup(target);
                flashSaved("已导出备份", 3000);
              }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出备份…
            </button>
            <button
              onClick={() => setConfirmingRestore(true)}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100"
            >
              从备份恢复…
            </button>
          </div>
        </Row>

        <Row label="关于" hint={`ScanScore v${appVersion ?? "…"}`}>
          <ul className="space-y-1 text-xs text-zinc-500">
            <li>· 本项目以 MIT 许可发布</li>
            <li>
              · OMR 引擎{" "}
              <a
                className="text-indigo-500 hover:underline"
                href="https://github.com/Audiveris/audiveris"
                target="_blank"
                rel="noreferrer"
              >
                Audiveris
              </a>{" "}
              （AGPL-3.0，独立进程调用）
            </li>
            <li>
              · 渲染/播放{" "}
              <a
                className="text-indigo-500 hover:underline"
                href="https://alphatab.net"
                target="_blank"
                rel="noreferrer"
              >
                alphaTab
              </a>{" "}
              （MIT）
            </li>
            <li>· 音源 GeneralUser GS（S. Christian Collins，免费分发）· SONiVOX EAS（Apache-2.0）</li>
          </ul>
        </Row>
      </div>

      {/* 恢复备份确认（window.confirm 在 wry 中不可用） */}
      <ConfirmDialog
        open={confirmingRestore}
        title="从备份恢复"
        message="恢复备份将覆盖当前全部曲库数据（数据库与乐谱文件），且完成后需重启应用生效。"
        confirmLabel="覆盖恢复"
        busy={restoring}
        onConfirm={async () => {
          setRestoring(true);
          try {
            const source = await api.pickBackupSource();
            if (!source) {
              // 用户在文件选择器里取消：关掉确认框，不当作失败
              setConfirmingRestore(false);
              return;
            }
            const n = await api.importBackup(source);
            setConfirmingRestore(false);
            flashSaved(`已恢复 ${n} 个文件，请重启应用生效`, 6000);
          } catch (e) {
            setConfirmingRestore(false);
            showToast({ message: `恢复失败：${String(e)}` }, 6000);
          } finally {
            setRestoring(false);
          }
        }}
        onCancel={() => {
          if (!restoring) setConfirmingRestore(false);
        }}
      />
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
  useDismissOnEsc(open, () => setOpen(false));
  return (
    <div className="relative shrink-0">
      <div className="flex">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="模型"
          aria-label="模型名称"
          className="w-40 rounded-l-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="展开模型列表"
          aria-expanded={open}
          className="rounded-r-lg border border-l-0 border-zinc-200 px-2 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          ▾
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="模型列表"
            className="anim-pop-in absolute right-0 top-full z-20 mt-1 max-h-60 w-72 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500">
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
                    m === value ? "font-semibold text-indigo-600" : "text-zinc-700"
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
