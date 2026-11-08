import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlphaTabApi, LayoutMode, midi, model } from "@coderline/alphatab";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, readAssetBytes, type Score } from "../lib/tauri";
import { useUi } from "../stores/ui";
import ScoreViewer from "../components/ScoreViewer";
import PlayerBar from "../components/PlayerBar";

interface TrackInfo {
  track: model.Track;
  name: string;
  muted: boolean;
}

const INSTRUMENT_LABEL: Record<string, string> = {
  piano: "钢琴",
  guitar: "吉他",
  other: "其他",
};

export default function ScoreDetailPage({ scoreId }: { scoreId: string }) {
  const openLibrary = useUi((s) => s.openLibrary);
  const queryClient = useQueryClient();
  const [atApi, setAtApi] = useState<AlphaTabApi | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState({ currentTimeMs: 0, endTimeMs: 0 });
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [loadKey, setLoadKey] = useState(0); // 重新识别后强制重载
  const scoreModelRef = useRef<model.Score | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [layout, setLayout] = useState<"page" | "horizontal">("page");

  // 元数据编辑
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", composer: "", instrument: "other" });

  const score = useQuery({
    queryKey: ["score", scoreId],
    queryFn: () => api.getScore(scoreId),
  });

  const s: Score | null = score.data ?? null;

  // 要加载的资产路径：识别产物 score.xml 优先，其次原始文件（gp/musicxml）
  const assetPath = s?.musicxmlPath ?? (s?.sourceType === "gp" ? s.originalPath : null);
  const isPlayable = s?.status === "ready" && !!assetPath;

  const asset = useQuery({
    queryKey: ["asset", assetPath, loadKey],
    queryFn: () => readAssetBytes(assetPath!),
    enabled: !!assetPath,
  });

  const jobs = useQuery({
    queryKey: ["jobs", scoreId],
    queryFn: () => api.listJobs(scoreId),
    refetchInterval: s?.status === "processing" ? 1500 : false,
  });
  const runningJob = jobs.data?.find((j) => j.state === "running" || j.state === "queued");

  const recognize = useMutation({
    mutationFn: () => api.startRecognition([scoreId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["score", scoreId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", scoreId] });
    },
  });

  const del = useMutation({
    mutationFn: () => api.deleteScore(scoreId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      openLibrary();
    },
  });

  const saveMeta = useMutation({
    mutationFn: () =>
      api.updateScore(scoreId, draft.title || s?.title || "未命名", draft.composer || undefined, draft.instrument),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["score", scoreId] });
      queryClient.invalidateQueries({ queryKey: ["scores"] });
    },
  });

  const exportMidi = async () => {
    const score = scoreModelRef.current;
    if (!score) return;
    const midiFile = new midi.MidiFile();
    const handler = new midi.AlphaSynthMidiFileHandler(midiFile);
    const generator = new midi.MidiFileGenerator(score, null, handler);
    generator.generate();
    const bytes = midiFile.toBinary();
    const target = await api.pickSavePath(`${s?.title ?? "score"}.mid`, "mid");
    if (target) {
      await api.writeExportBytes(target, bytes);
    }
  };

  const exportSource = async () => {
    if (!s) return;
    const isGp = s.sourceType === "gp";
    const ext = isGp ? "gp" : "xml";
    const target = await api.pickSavePath(`${s.title}.${ext}`, ext);
    if (target) {
      await api.exportScoreSource(s.id, target);
    }
  };

  // 识别产物路径变化 → 强制刷新资产并重载
  const prevMxlRef = useRef<string | null>(null);
  useEffect(() => {
    if (s?.musicxmlPath && s.musicxmlPath !== prevMxlRef.current) {
      prevMxlRef.current = s.musicxmlPath;
      setLoadKey((k) => k + 1);
    }
    if (!s?.musicxmlPath) prevMxlRef.current = null;
  }, [s?.musicxmlPath]);

  const canRecognize =
    s && (s.sourceType === "pdf" || s.sourceType === "png" || s.sourceType === "jpg");

  const statusText = useMemo(() => {
    if (!s) return "";
    switch (s.status) {
      case "imported":
        return "待识别：导入的扫描件尚未进行光学识别";
      case "processing":
        return `识别中… ${runningJob ? `${runningJob.progress}% ${runningJob.message ?? ""}` : ""}`;
      case "ready":
        return "可播放";
      case "failed":
        return `识别失败：${s.errorMessage ?? "未知错误"}`;
    }
  }, [s, runningJob]);

  // 原图对照（pdf/png 源；多页合并曲谱支持翻页）
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [logText, setLogText] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showAtxEditor, setShowAtxEditor] = useState(false);
  const [atxDraft, setAtxDraft] = useState("");
  const [atxMsg, setAtxMsg] = useState<string | null>(null);
  const pages = s?.pages ?? [];
  const originalAssetPath =
    pages.length > 0
      ? (pages[Math.min(pageIndex, pages.length - 1)] ?? null)
      : (s?.originalPath ?? null);
  useEffect(() => {
    if (!originalAssetPath || !["png", "jpg", "pdf"].includes(s?.sourceType ?? "")) return;
    let url: string | null = null;
    api
      .readScoreAsset(originalAssetPath)
      .then((bytes) => {
        const lower = originalAssetPath.toLowerCase();
        const mime = lower.endsWith(".pdf")
          ? "application/pdf"
          : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
            ? "image/jpeg"
            : "image/png";
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        setOriginalUrl(url);
      })
      .catch(() => setOriginalUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [originalAssetPath, s?.sourceType]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <button
          onClick={openLibrary}
          className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          ← 曲库
        </button>
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="标题"
              className="w-48 rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
            <input
              value={draft.composer}
              onChange={(e) => setDraft((d) => ({ ...d, composer: e.target.value }))}
              placeholder="作曲者"
              className="w-36 rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
            <select
              value={draft.instrument}
              onChange={(e) => setDraft((d) => ({ ...d, instrument: e.target.value }))}
              className="rounded border border-zinc-300 px-1 py-1 text-sm"
            >
              <option value="piano">钢琴</option>
              <option value="guitar">吉他</option>
              <option value="other">其他</option>
            </select>
            <button
              onClick={() => saveMeta.mutate()}
              className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-500"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-zinc-300 px-3 py-1 text-sm text-zinc-500"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold">{s?.title ?? "…"}</div>
              {s && (
                <button
                  onClick={() => {
                    setDraft({
                      title: s.title,
                      composer: s.composer ?? "",
                      instrument: s.instrument,
                    });
                    setEditing(true);
                  }}
                  className="text-xs text-zinc-400 hover:text-indigo-600"
                  title="编辑信息"
                >
                  ✎
                </button>
              )}
            </div>
            <div className="truncate text-xs text-zinc-400">
              {s ? `${INSTRUMENT_LABEL[s.instrument] ?? "其他"} · ` : ""}
              {s?.composer ? `${s.composer} · ` : ""}
              {statusText}
            </div>
          </div>
        )}
        <div className="flex-1" />
        {isPlayable && (
          <>
            <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200" title="缩放">
              <button
                onClick={() => {
                  if (!atApi) return;
                  atApi.settings.display.scale = Math.max(0.5, atApi.settings.display.scale - 0.2);
                  atApi.updateSettings();
                  atApi.render();
                  setScale(atApi.settings.display.scale);
                }}
                className="px-2 py-1 text-sm text-zinc-600 hover:text-indigo-600"
              >
                −
              </button>
              <span className="w-10 text-center text-[11px] text-zinc-400">
                {Math.round((scale ?? 1) * 100)}%
              </span>
              <button
                onClick={() => {
                  if (!atApi) return;
                  atApi.settings.display.scale = Math.min(2.5, atApi.settings.display.scale + 0.2);
                  atApi.updateSettings();
                  atApi.render();
                  setScale(atApi.settings.display.scale);
                }}
                className="px-2 py-1 text-sm text-zinc-600 hover:text-indigo-600"
              >
                ＋
              </button>
            </div>
            <button
              onClick={() => {
                if (!atApi) return;
                const next = layout === "page" ? LayoutMode.Horizontal : LayoutMode.Page;
                atApi.settings.display.layoutMode = next;
                atApi.updateSettings();
                atApi.render();
                setLayout(next === LayoutMode.Horizontal ? "horizontal" : "page");
              }}
              className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              title="切换滚动方向"
            >
              {layout === "page" ? "⇉ 横向" : "▦ 分页"}
            </button>
          </>
        )}
        {canRecognize && (
          <button
            onClick={() => recognize.mutate()}
            disabled={s?.status === "processing"}
            className="shrink-0 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {s?.status === "processing" ? "识别中…" : s?.status === "imported" ? "开始识别" : "重新识别"}
          </button>
        )}
        {s?.musicxmlPath?.endsWith(".atx") && (
          <button
            onClick={async () => {
              const bytes = await readAssetBytes(s.musicxmlPath!);
              setAtxDraft(new TextDecoder().decode(bytes));
              setAtxMsg(null);
              setShowAtxEditor(true);
            }}
            className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            title="手动校对 AI 转录的 alphaTex"
          >
            编辑谱
          </button>
        )}
        {jobs.data && jobs.data.length > 0 && (
          <button
            onClick={async () => {
              const last = jobs.data![0];
              const log = await api.readJobLog(last.id);
              setLogText(log ?? "（该任务无日志记录）");
              setShowLog(true);
            }}
            className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            title="查看最近一次识别的引擎日志"
          >
            日志
          </button>
        )}
        {s?.status === "failed" && (s.errorMessage ?? "").includes("六线谱") && (
          <button
            onClick={() =>
              openUrl(
                `https://www.songsterr.com/a/wa/search?pattern=${encodeURIComponent(s.title)}`,
              )
            }
            className="shrink-0 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100"
            title="跳转 Songsterr 搜索这首歌的 Guitar Pro 版本"
          >
            找 Guitar Pro 版本 ↗
          </button>
        )}
        {originalUrl && (
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className={`shrink-0 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm ${
              showOriginal
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
            title={showOriginal ? "隐藏原图对照" : "对照原图"}
          >
            原图
          </button>
        )}
        {isPlayable && (
          <ExportMenu onMidi={() => exportMidi()} onSource={() => exportSource()} />
        )}
        <button
          onClick={() => del.mutate()}
          className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          title="删除"
        >
          🗑
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {isPlayable ? (
          asset.isError ? (
            <div className="grid flex-1 place-items-center text-sm text-red-500">
              乐谱文件读取失败
            </div>
          ) : !asset.data ? (
            <div className="grid flex-1 place-items-center text-sm text-zinc-400">加载乐谱…</div>
          ) : (
            <ScoreViewer
              key={`${assetPath}-${loadKey}`}
              data={asset.data}
              onReady={setAtApi}
              callbacks={{
                onScoreLoaded: (score, trackInfos) => {
                  scoreModelRef.current = score;
                  setTracks(trackInfos.map(({ name, track }) => ({ track, name, muted: false })));
                },
                onPlayerState: setPlaying,
                onPosition: (currentTimeMs, endTimeMs) => setPosition({ currentTimeMs, endTimeMs }),
                onFinished: () => setPlaying(false),
              }}
            />
          )
        ) : (
          <div className="grid flex-1 place-items-center bg-zinc-50 px-6 text-center">
            {s?.status === "processing" ? (
              <div className="text-zinc-500">
                <div className="text-4xl">🔍</div>
                <div className="mt-3 text-sm">正在识别，进度 {runningJob?.progress ?? 0}%</div>
                <div className="mt-1 max-w-md truncate text-xs text-zinc-400">
                  {runningJob?.message ?? "…"}
                </div>
                <button
                  onClick={async () => {
                    if (runningJob) {
                      await api.cancelRecognition(runningJob.id);
                    }
                  }}
                  className="mt-4 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  取消识别
                </button>
              </div>
            ) : (
              <div className="text-zinc-500">
                <div className="text-4xl">📄</div>
                <div className="mt-3 text-sm">
                  {s?.status === "failed"
                    ? `识别失败：${s.errorMessage ?? "未知错误"}`
                    : "这份谱还没有识别，点击上方「开始识别」"}
                </div>
                {canRecognize && (
                  <button
                    onClick={() => recognize.mutate()}
                    className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
                  >
                    开始识别
                  </button>
                )}
                {originalUrl && s?.sourceType !== "pdf" && (
                  <img src={originalUrl} alt="原图" className="mt-4 max-h-64 rounded-lg shadow" />
                )}
              </div>
            )}
          </div>
        )}

        {/* 原图对照层 */}
        {showOriginal && originalUrl && (
          <div className="max-h-[40%] shrink-0 overflow-auto border-t border-zinc-200 bg-zinc-100 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
              <span>原图对照</span>
              {pages.length > 1 && (
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    disabled={pageIndex === 0}
                    className="rounded border border-zinc-300 px-1.5 disabled:opacity-40"
                  >
                    ◀
                  </button>
                  <span>
                    第 {Math.min(pageIndex, pages.length - 1) + 1} / {pages.length} 页
                  </span>
                  <button
                    onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
                    disabled={pageIndex >= pages.length - 1}
                    className="rounded border border-zinc-300 px-1.5 disabled:opacity-40"
                  >
                    ▶
                  </button>
                </span>
              )}
            </div>
            {originalAssetPath?.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={originalUrl}
                className="h-96 w-full rounded border bg-white"
                title="原图"
              />
            ) : (
              <img src={originalUrl} alt="原图" className="mx-auto max-w-full" />
            )}
          </div>
        )}
      </div>

      {isPlayable && asset.data && (
        <PlayerBar
          api={atApi}
          playing={playing}
          currentTimeMs={position.currentTimeMs}
          endTimeMs={position.endTimeMs}
          tracks={tracks}
          onToggleMute={(track) => {
            if (!atApi) return;
            const current = tracks.find((t) => t.track.index === track.index);
            const muted = !current?.muted;
            atApi.changeTrackMute([track], muted);
            setTracks((ts) =>
              ts.map((t) => (t.track.index === track.index ? { ...t, muted } : t)),
            );
          }}
        />
      )}
      {showAtxEditor && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/40">
          <div className="flex h-[85%] w-[860px] max-w-[95%] flex-col rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">编辑 alphaTex（AI 转录结果校对）</div>
              <button onClick={() => setShowAtxEditor(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              语法：品.弦（如 5.4 = 4弦5品），:4/:8/:16 时值前缀，r 休止，x.弦 闷音，{"{h}"}{"{p}"}{"{s}"} 击勾滑，| 分小节。保存后立即重新渲染。
            </div>
            <textarea
              value={atxDraft}
              onChange={(e) => setAtxDraft(e.target.value)}
              spellCheck={false}
              className="mt-2 flex-1 resize-none rounded-lg border border-zinc-200 p-3 font-mono text-xs outline-none focus:border-indigo-400"
            />
            {atxMsg && <div className="mt-1 text-xs text-emerald-600">{atxMsg}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowAtxEditor(false)}
                className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.saveAlphaTex(scoreId, atxDraft);
                    setAtxMsg("已保存");
                    setShowAtxEditor(false);
                    setLoadKey((k) => k + 1); // 强制重新渲染
                    queryClient.invalidateQueries({ queryKey: ["asset"] });
                  } catch (e) {
                    setAtxMsg(`保存失败：${String(e)}`);
                  }
                }}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500"
              >
                保存并刷新
              </button>
            </div>
          </div>
        </div>
      )}
      {showLog && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/40" onClick={() => setShowLog(false)}>
          <div
            className="flex h-[80%] w-[720px] max-w-[90%] flex-col rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">识别引擎日志</div>
              <button onClick={() => setShowLog(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>
            <pre className="mt-3 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 text-[11px] leading-4 text-zinc-100">
              {logText}
            </pre>
          </div>
        </div>
      )}

    </div>
  );
}

/// 导出下拉菜单（收拢 MIDI / 乐谱文件两个入口）
function ExportMenu({ onMidi, onSource }: { onMidi: () => void; onSource: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm ${
          open
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        导出 ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
            <button
              onClick={() => {
                setOpen(false);
                onMidi();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              导出 MIDI
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onSource();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              导出乐谱文件
            </button>
          </div>
        </>
      )}
    </div>
  );
}
