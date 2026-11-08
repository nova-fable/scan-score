import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlphaTabApi, LayoutMode, midi, model } from "@coderline/alphatab";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, readAssetBytes, type Score } from "../lib/tauri";
import { useUi } from "../stores/ui";
import { useDialog, useDismissOnEsc } from "../lib/useDialog";
import ScoreViewer from "../components/ScoreViewer";
import PlayerBar from "../components/PlayerBar";
import ConfirmDialog from "../components/ConfirmDialog";

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
  const softDeleteScores = useUi((s) => s.softDeleteScores);
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

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRerecognize, setConfirmingRerecognize] = useState(false);
  const [confirmDiscardAtx, setConfirmDiscardAtx] = useState(false);

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

  const [showAtxEditor, setShowAtxEditor] = useState(false);
  const [atxDraft, setAtxDraft] = useState("");
  const [atxMsg, setAtxMsg] = useState<string | null>(null);
  const [atxPageIndex, setAtxPageIndex] = useState(0);
  const [atxSync, setAtxSync] = useState(true);
  const [atxImageUrl, setAtxImageUrl] = useState<string | null>(null);
  const [atxCaretBar, setAtxCaretBar] = useState(0);
  const [atxJumpTo, setAtxJumpTo] = useState("");
  const atxTextRef = useRef<HTMLTextAreaElement>(null);
  const atxImgRef = useRef<HTMLDivElement>(null);
  const atxSyncing = useRef(false);
  const editorPages = s?.pages.length ? s.pages : s?.originalPath ? [s.originalPath] : [];
  const atxBarCount = Math.max(1, (atxDraft.match(/\|/g) || []).length);
  // 编辑器脏检查：取消/Esc 不得静默丢弃用户改过的草稿
  const atxBaseline = useRef("");
  const atxDirty = atxDraft !== atxBaseline.current;
  const closeAtxEditor = () => {
    if (atxDirty) setConfirmDiscardAtx(true);
    else setShowAtxEditor(false);
  };

  // 校对编辑器的原图页
  useEffect(() => {
    if (!showAtxEditor) return;
    const path = editorPages.length
      ? (editorPages[Math.min(atxPageIndex, editorPages.length - 1)] ?? null)
      : null;
    if (!path) {
      setAtxImageUrl(null);
      return;
    }
    let url: string | null = null;
    api
      .readScoreAsset(path)
      .then((bytes) => {
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
        setAtxImageUrl(url);
      })
      .catch(() => setAtxImageUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAtxEditor, atxPageIndex]);

  // 滚动同步（比例映射，双向；用标记防循环）
  const syncScroll = (source: "text" | "img", el: HTMLTextAreaElement | HTMLDivElement) => {
    if (!atxSync || atxSyncing.current) return;
    const maxSelf = el.scrollHeight - el.clientHeight;
    if (maxSelf <= 0) return;
    const ratio = el.scrollTop / maxSelf;
    atxSyncing.current = true;
    if (source === "text" && atxImgRef.current) {
      const img = atxImgRef.current;
      img.scrollTop = ratio * (img.scrollHeight - img.clientHeight);
    } else if (source === "img" && atxTextRef.current) {
      const tx = atxTextRef.current;
      tx.scrollTop = ratio * (tx.scrollHeight - tx.clientHeight);
    }
    requestAnimationFrame(() => {
      atxSyncing.current = false;
    });
  };

  // 小节跳转：移动光标到第 n 小节起始并滚动编辑区
  const goToBar = (n: number) => {
    if (!Number.isFinite(n) || n < 1 || !atxTextRef.current) return;
    let offset = 0;
    let seen = 1;
    if (n > 1) {
      const text = atxDraft;
      let idx = -1;
      for (let k = 0; k < n - 1; k++) {
        idx = text.indexOf("|", idx + 1);
        if (idx === -1) break;
        seen = k + 2;
      }
      offset = idx === -1 ? text.length : idx + 2;
    }
    const line = atxDraft.slice(0, Math.min(offset, atxDraft.length)).split("\n").length - 1;
    atxTextRef.current.focus();
    atxTextRef.current.setSelectionRange(Math.min(offset, atxDraft.length), Math.min(offset, atxDraft.length));
    atxTextRef.current.scrollTop = Math.max(0, line * 16 - 40);
    setAtxCaretBar(seen);
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

  // 键盘层：Space 播放/暂停、←/→ ±5s、Esc 逐层退出（模态 → 编辑态）
  const positionRef = useRef(position);
  positionRef.current = position;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAtxEditor) setShowAtxEditor(false);
        else if (showLog) setShowLog(false);
        else if (editing) setEditing(false);
        return;
      }
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
      if (!isPlayable || !atApi?.player) return;
      // 进度条滑杆有自己的方向键处理，全局层不重复响应
      if (t?.getAttribute?.("role") === "slider") return;
      if (e.key === " ") {
        e.preventDefault();
        if (playing) atApi.pause();
        else atApi.play();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const { currentTimeMs, endTimeMs } = positionRef.current;
        const end = endTimeMs > 0 ? endTimeMs : 1;
        const next = Math.min(end, Math.max(0, currentTimeMs + (e.key === "ArrowRight" ? 5000 : -5000)));
        atApi.player.tickPosition = Math.round((next / end) * atApi.endTick);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [atApi, playing, isPlayable, showAtxEditor, showLog, editing]);
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

  const atxDialogRef = useDialog(showAtxEditor, closeAtxEditor);
  const logDialogRef = useDialog(showLog, () => setShowLog(false));

  const scaleValue = scale ?? 1;
  const overflowItems = [
    ...(s?.musicxmlPath?.endsWith(".atx")
      ? [
          {
            label: "编辑谱",
            onClick: async () => {
              const bytes = await readAssetBytes(s.musicxmlPath!);
              const text = new TextDecoder().decode(bytes);
              setAtxDraft(text);
              atxBaseline.current = text;
              setAtxMsg(null);
              setAtxPageIndex(0);
              setShowAtxEditor(true);
            },
          },
        ]
      : []),
    ...(jobs.data && jobs.data.length > 0
      ? [
          {
            label: "日志",
            onClick: async () => {
              const last = jobs.data![0];
              const log = await api.readJobLog(last.id);
              setLogText(log ?? "（该任务无日志记录）");
              setShowLog(true);
            },
          },
        ]
      : []),
    ...(s?.status === "failed" && (s.errorMessage ?? "").includes("六线谱")
      ? [
          {
            label: "找 Guitar Pro 版本 ↗",
            onClick: () =>
              openUrl(
                `https://www.songsterr.com/a/wa/search?pattern=${encodeURIComponent(s.title)}`,
              ),
          },
        ]
      : []),
    {
      label: "删除曲谱",
      danger: true,
      onClick: () => setConfirmingDelete(true),
    },
  ];

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
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMeta.mutate();
              }}
              placeholder="标题"
              aria-label="标题"
              className="w-48 rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
            <input
              value={draft.composer}
              onChange={(e) => setDraft((d) => ({ ...d, composer: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMeta.mutate();
              }}
              placeholder="作曲者"
              aria-label="作曲者"
              className="w-36 rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
            />
            <select
              value={draft.instrument}
              onChange={(e) => setDraft((d) => ({ ...d, instrument: e.target.value }))}
              aria-label="乐器"
              className="rounded-lg border border-zinc-300 px-1 py-1 text-sm"
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
                  className="text-xs text-zinc-400 transition hover:text-indigo-600"
                  title="编辑信息"
                  aria-label="编辑信息"
                >
                  ✎
                </button>
              )}
            </div>
            <div className="truncate text-xs text-zinc-500 select-text">
              {s ? `${INSTRUMENT_LABEL[s.instrument] ?? "其他"} · ` : ""}
              {s?.composer ? `${s.composer} · ` : ""}
              {statusText}
            </div>
          </div>
        )}
        <div className="flex-1" />
        {/* 次级簇（内距 8px），识别主按钮独立在簇外 12px */}
        <div className="flex items-center gap-2">
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
          {isPlayable && <ExportMenu onMidi={() => exportMidi()} onSource={() => exportSource()} />}
          <OverflowMenu items={overflowItems} />
        </div>
        {canRecognize && (
          <button
            onClick={() => {
              // 已有用户校对保存的谱文时，重识别会覆盖它——先确认
              if (s?.musicxmlPath?.endsWith(".atx")) setConfirmingRerecognize(true);
              else recognize.mutate();
            }}
            disabled={s?.status === "processing"}
            className="shrink-0 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {s?.status === "processing" ? "识别中…" : s?.status === "imported" ? "开始识别" : "重新识别"}
          </button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isPlayable ? (
          asset.isError ? (
            <div className="grid flex-1 place-items-center text-sm text-red-600">
              乐谱文件读取失败
            </div>
          ) : !asset.data ? (
            <div className="grid flex-1 place-items-center text-sm text-zinc-500">加载乐谱…</div>
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
                <div className="mt-1 max-w-md truncate select-text text-xs text-zinc-500">
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
                <div className="mx-auto mt-3 max-w-md select-text text-sm">
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

        {/* 视图控制簇（缩放 + 滚动方向），悬浮于查看器右上角 */}
        {isPlayable && asset.data && (
          <div
            className="absolute right-5 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white/95 px-1 py-0.5 shadow-sm"
            role="group"
            aria-label="视图控制"
          >
            <button
              onClick={() => {
                if (!atApi) return;
                atApi.settings.display.scale = Math.max(0.5, atApi.settings.display.scale - 0.2);
                atApi.updateSettings();
                atApi.render();
                setScale(atApi.settings.display.scale);
              }}
              disabled={scaleValue <= 0.51}
              aria-label="缩小"
              className="px-2 py-1 text-sm text-zinc-600 hover:text-indigo-600 disabled:opacity-40"
            >
              −
            </button>
            <span className="w-10 text-center text-micro text-zinc-500">
              {Math.round(scaleValue * 100)}%
            </span>
            <button
              onClick={() => {
                if (!atApi) return;
                atApi.settings.display.scale = Math.min(2.5, atApi.settings.display.scale + 0.2);
                atApi.updateSettings();
                atApi.render();
                setScale(atApi.settings.display.scale);
              }}
              disabled={scaleValue >= 2.49}
              aria-label="放大"
              className="px-2 py-1 text-sm text-zinc-600 hover:text-indigo-600 disabled:opacity-40"
            >
              ＋
            </button>
            <span className="mx-1 h-4 w-px bg-zinc-200" />
            <button
              onClick={() => {
                if (!atApi) return;
                const next = layout === "page" ? LayoutMode.Horizontal : LayoutMode.Page;
                atApi.settings.display.layoutMode = next;
                atApi.updateSettings();
                atApi.render();
                setLayout(next === LayoutMode.Horizontal ? "horizontal" : "page");
              }}
              aria-label="切换滚动方向"
              title="切换滚动方向"
              className="px-2 py-1 text-xs text-zinc-600 hover:text-indigo-600"
            >
              {layout === "page" ? "⇉ 横向" : "▦ 分页"}
            </button>
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
                    aria-label="上一页"
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
                    aria-label="下一页"
                    className="rounded border border-zinc-300 px-1.5 disabled:opacity-40"
                  >
                    ▶
                  </button>
                </span>
              )}
            </div>
            {originalAssetPath?.toLowerCase().endsWith(".pdf") ? (
              // 固定 208px：始终小于对照区最大高（min 窗约 212px），消除 iframe 嵌套双滚条
              <iframe
                src={originalUrl}
                className="h-52 w-full rounded border bg-white"
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
        <div className="anim-fade-in fixed inset-0 z-30 grid place-items-center bg-black/40">
          <div
            ref={atxDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="校对编辑器"
            className="anim-pop-in flex h-[88%] w-[1100px] max-w-[96%] flex-col rounded-2xl bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">校对编辑器 — 原图对照 · alphaTex</div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={atxSync}
                    onChange={(e) => setAtxSync(e.target.checked)}
                    className="h-3.5 w-3.5 accent-indigo-600"
                  />
                  滚动同步
                </label>
                <button
                  onClick={closeAtxEditor}
                  aria-label="关闭校对编辑器"
                  className="text-zinc-400 transition hover:text-zinc-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-2 flex min-h-0 flex-1 gap-3">
              {/* 左：原图对照 */}
              <div className="flex w-1/2 min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50">
                <div className="flex items-center justify-between border-b border-zinc-100 px-2 py-1.5 text-xs text-zinc-500">
                  <span>原始扫描图</span>
                  {editorPages.length > 1 && (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => setAtxPageIndex((p) => Math.max(0, p - 1))}
                        disabled={atxPageIndex === 0}
                        aria-label="上一页"
                        className="rounded border border-zinc-300 px-1.5 disabled:opacity-40"
                      >
                        ◀
                      </button>
                      第 {atxPageIndex + 1} / {editorPages.length} 页
                      <button
                        onClick={() => setAtxPageIndex((p) => Math.min(editorPages.length - 1, p + 1))}
                        disabled={atxPageIndex >= editorPages.length - 1}
                        aria-label="下一页"
                        className="rounded border border-zinc-300 px-1.5 disabled:opacity-40"
                      >
                        ▶
                      </button>
                    </span>
                  )}
                </div>
                <div ref={atxImgRef} className="min-h-0 flex-1 overflow-auto p-2">
                  {atxImageUrl ? (
                    <img src={atxImageUrl} alt="原图" className="mx-auto w-full" />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-zinc-500">无原图</div>
                  )}
                </div>
              </div>

              {/* 右：alphaTex 编辑区 */}
              <div className="flex w-1/2 min-w-0 flex-col rounded-lg border border-zinc-200">
                <div className="flex items-center justify-between border-b border-zinc-100 px-2 py-1.5 text-xs text-zinc-500">
                  <span>
                    alphaTex · 共 {atxBarCount} 小节
                    {atxCaretBar > 0 && (
                      <span className="ml-2 text-indigo-500">光标在第 {atxCaretBar} 小节</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <input
                      value={atxJumpTo}
                      onChange={(e) => setAtxJumpTo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") goToBar(Number(atxJumpTo));
                      }}
                      placeholder="小节"
                      aria-label="跳转到小节"
                      className="w-14 rounded border border-zinc-200 px-1.5 py-0.5 text-right"
                    />
                    <button
                      onClick={() => goToBar(Number(atxJumpTo))}
                      className="rounded border border-zinc-200 px-1.5 py-0.5 hover:bg-zinc-50"
                    >
                      跳转
                    </button>
                  </span>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-micro text-amber-700">
                  品.弦（5.4 = 4弦5品）· :4/:8/:16 时值 · r 休止 · x.弦 闷音 · {"{h}"}{"{p}"}{"{s}"} 击勾滑 · | 分小节
                </div>
                <textarea
                  ref={atxTextRef}
                  value={atxDraft}
                  onChange={(e) => setAtxDraft(e.target.value)}
                  onSelect={(e) => {
                    const pos = (e.target as HTMLTextAreaElement).selectionStart;
                    setAtxCaretBar(atxDraft.slice(0, pos).split("|").length);
                  }}
                  onScroll={(e) => syncScroll("text", e.currentTarget)}
                  spellCheck={false}
                  autoFocus
                  aria-label="alphaTex 谱文"
                  className="min-h-0 flex-1 resize-none p-3 font-mono text-xs leading-4 outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            {atxMsg && <div className="mt-1 text-xs text-emerald-600">{atxMsg}</div>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-500">
                {atxDirty ? "有未保存的修改" : ""}
              </span>
              <div className="flex justify-end gap-2">
                <button
                  onClick={closeAtxEditor}
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
                    setLoadKey((k) => k + 1);
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
        </div>
      )}
      {showLog && (
        <div className="anim-fade-in fixed inset-0 z-30 grid place-items-center bg-black/40" onClick={() => setShowLog(false)}>
          <div
            ref={logDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="识别引擎日志"
            className="anim-pop-in flex h-[80%] w-[720px] max-w-[90%] flex-col rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">识别引擎日志</div>
              <button
                onClick={() => setShowLog(false)}
                aria-label="关闭日志"
                className="text-zinc-400 transition hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <pre className="mt-3 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 text-micro text-zinc-100">
              {logText}
            </pre>
          </div>
        </div>
      )}

      {/* 删除确认（window.confirm 在 wry 中不可用） */}
      <ConfirmDialog
        open={confirmingDelete}
        title="删除曲谱"
        message={`将永久删除「${s?.title ?? ""}」及其全部文件。删除后 30 秒内可在曲库撤销。`}
        confirmLabel="删除"
        onConfirm={() => {
          setConfirmingDelete(false);
          if (!s) return;
          softDeleteScores([s.id], `「${s.title}」`, queryClient);
          openLibrary();
        }}
        onCancel={() => setConfirmingDelete(false)}
      />

      {/* 重新识别守卫：覆盖已校对谱文前先确认 */}
      <ConfirmDialog
        open={confirmingRerecognize}
        title="重新识别"
        message="当前谱文包含已保存的校对内容，重新识别将用新的识别结果覆盖它。原扫描图保留。"
        confirmLabel="覆盖并重识"
        onConfirm={() => {
          setConfirmingRerecognize(false);
          recognize.mutate();
        }}
        onCancel={() => setConfirmingRerecognize(false)}
      />

      {/* 编辑器脏草稿守卫 */}
      <ConfirmDialog
        open={confirmDiscardAtx}
        title="放弃未保存的修改？"
        message="校对编辑器的修改尚未保存，关闭后将丢失。"
        confirmLabel="放弃修改"
        onConfirm={() => {
          setConfirmDiscardAtx(false);
          setShowAtxEditor(false);
        }}
        onCancel={() => setConfirmDiscardAtx(false)}
      />
    </div>
  );
}

/// 「⋯」溢出菜单：收纳低频/危险操作，保持头部三锚点（识别 / 原图 / 导出）
function OverflowMenu({
  items,
}: {
  items: { label: string; danger?: boolean; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  useDismissOnEsc(open, () => setOpen(false));
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="更多操作"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`grid h-8 w-8 place-items-center rounded-lg border text-sm ${
          open
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="更多操作"
            className="anim-pop-in absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                  it.danger ? "text-red-600" : "text-zinc-700"
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/// 导出下拉菜单（收拢 MIDI / 乐谱文件两个入口）
function ExportMenu({ onMidi, onSource }: { onMidi: () => void; onSource: () => void }) {
  const [open, setOpen] = useState(false);
  useDismissOnEsc(open, () => setOpen(false));
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
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
          <div
            role="menu"
            aria-label="导出"
            className="anim-pop-in absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMidi();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              导出 MIDI
            </button>
            <button
              role="menuitem"
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
