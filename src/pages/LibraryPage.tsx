import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api, type Score } from "../lib/tauri";
import { useUi } from "../stores/ui";
import { useDialog } from "../lib/useDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconCheck } from "../components/icons";

const STATUS_LABEL: Record<Score["status"], string> = {
  imported: "待识别",
  processing: "识别中",
  ready: "可播放",
  failed: "识别失败",
};

/// 状态 = 封面上的专色贴纸(-2° 微旋,像贴上去的标签)
const STATUS_BADGE: Record<Score["status"], string> = {
  imported: "bg-spot-wait text-paper",
  processing: "bg-spot-run text-paper",
  ready: "bg-spot-ok text-paper",
  failed: "bg-spot-fail text-paper",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  ...(Object.entries(STATUS_LABEL) as [Score["status"], string][]).map(([value, label]) => ({
    value,
    label,
  })),
];

const INSTRUMENT_LABEL: Record<string, string> = {
  piano: "钢琴",
  guitar: "吉他",
  other: "其他",
};

const SOURCE_LABEL: Record<Score["sourceType"], string> = {
  pdf: "PDF",
  png: "图片",
  jpg: "图片",
  musicxml: "MusicXML",
  gp: "Guitar Pro",
};

/// 无封面时的排印封面:上双细线 + 下单细线的仪式框里放曲名与作者
function TypeCover({ score }: { score: Score }) {
  return (
    <div className="flex min-h-[150px] flex-1 flex-col items-center justify-center py-2 text-center">
      <div className="cover-rule w-full px-1 pb-2.5 pt-3">
        <div className="font-disp text-[21px] font-black leading-tight line-clamp-3" title={score.title}>
          {score.title}
        </div>
      </div>
      {score.composer && (
        <div className="mt-2.5 text-[11px] font-bold tracking-[0.18em] opacity-85">
          {score.composer}
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  score,
  paper,
  progress,
  checked,
  onToggleCheck,
  onOpen,
  onRequestDelete,
}: {
  score: Score;
  paper: boolean;
  progress: number | null;
  checked: boolean;
  onToggleCheck: (shift: boolean) => void;
  onOpen: () => void;
  onRequestDelete: () => void;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let url: string | null = null;
    if (score.coverPath) {
      api
        .readScoreAsset(score.coverPath)
        .then((bytes) => {
          url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
          setCoverUrl(url);
        })
        .catch(() => setCoverUrl(null));
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [score.coverPath]);

  const canRecognize =
    (score.sourceType === "pdf" || score.sourceType === "png" || score.sourceType === "jpg") &&
    score.status !== "processing";

  const recognize = useMutation({
    mutationFn: () => api.startRecognition([score.id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scores"] }),
  });

  const spine = [
    score.composer,
    INSTRUMENT_LABEL[score.instrument] ?? "其他",
    SOURCE_LABEL[score.sourceType],
    score.pageCount > 0 ? `${score.pageCount} 页` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`book-card group relative flex flex-col rounded-lg p-4 transition-[transform,box-shadow] duration-200 ${
        paper ? "paper-card" : ""
      }`}
    >
      {/* 多选框(左上角;静默态=发丝线描边,不压书封) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(e.shiftKey);
        }}
        aria-label={checked ? `取消选择 ${score.title}` : `选择 ${score.title}`}
        className={`absolute left-2.5 top-2.5 z-10 grid h-6 w-6 place-items-center rounded-md border ${
          checked
            ? "border-paper bg-paper text-ink"
            : "border-[color:var(--line)] bg-transparent text-transparent opacity-70 hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <IconCheck size={13} />
      </button>
      {/* 状态贴纸 */}
      <span
        className={`absolute right-3 top-3 z-10 -rotate-2 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${STATUS_BADGE[score.status]}`}
      >
        {score.status === "processing" && progress !== null
          ? `识别中 ${progress}%`
          : STATUS_LABEL[score.status]}
      </span>
      <button onClick={onOpen} className="block w-full text-left">
        {coverUrl ? (
          <>
            {/* 有封面图的册子仍是书:排印标题带在上,封面图是图版,书脊信息行在下 */}
            <div className="cover-rule w-full px-1 pb-1.5 pt-2">
              <div
                className="font-disp text-[15px] font-black leading-tight line-clamp-1"
                title={score.title}
              >
                {score.title}
              </div>
            </div>
            <img src={coverUrl} alt="" className="mt-2.5 h-36 w-full rounded-sm object-cover" />
          </>
        ) : (
          <TypeCover score={score} />
        )}
        {score.status === "processing" && progress !== null && (
          <div className="mt-3 h-[5px] w-full overflow-hidden rounded-full [background-color:rgba(28,36,32,0.12)]">
            <div
              className="h-full rounded-full bg-spot-run transition-[width] duration-300"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
        )}
        {score.errorMessage && (
          <div
            className="mt-2 line-clamp-1 select-text text-xs text-spot-fail"
            title={score.errorMessage}
          >
            {score.errorMessage}
          </div>
        )}
        {/* 书脊信息行 */}
        <div className="mt-3 border-t pt-2.5 text-center text-[11.5px] tracking-wide opacity-80 [border-color:var(--line)]">
          {spine}
        </div>
      </button>
      {/* 悬停浮现的操作(失败卡带重试 = 识别) */}
      <div className="absolute bottom-2.5 right-2.5 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {canRecognize && (
          <button
            onClick={() => recognize.mutate()}
            className="rounded-md bg-paper-bright/95 px-2 py-1 text-xs font-semibold text-ink shadow-sm hover:bg-paper-dim"
          >
            识别
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete();
          }}
          className="rounded-md bg-paper-bright/95 px-2 py-1 text-xs font-semibold text-spot-fail shadow-sm hover:bg-spot-fail/10"
        >
          删除
        </button>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const openScore = useUi((s) => s.openScore);
  const showToast = useUi((s) => s.showToast);
  const pendingDeleteIds = useUi((s) => s.pendingDeleteIds);
  const softDeleteScores = useUi((s) => s.softDeleteScores);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [instrument, setInstrument] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"default" | "title">("default");
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const lastCheckedRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dropDepth = useRef(0);
  const [folderFiles, setFolderFiles] = useState<string[] | null>(null);
  const folderDialogRef = useDialog(folderFiles !== null, () => setFolderFiles(null));
  const [mergeChecked, setMergeChecked] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmState, setConfirmState] = useState<
    { kind: "single"; score: Score } | { kind: "batch"; ids: string[] } | null
  >(null);

  // 搜索防抖：输入即时回显，300ms 后才触发查询
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ⌘F / Ctrl+F 聚焦搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const scores = useQuery({
    queryKey: ["scores", search, instrument, status],
    queryFn: () =>
      api.listScores({
        query: search || undefined,
        instrument: instrument || undefined,
        status: status || undefined,
      }),
  });

  // 识别队列状态(用于角标展示)——仅在曲库中有识别任务进行中时轮询
  const scoresList = useMemo(() => scores.data ?? [], [scores.data]);
  const hasProcessing = scoresList.some((s) => s.status === "processing");
  const allJobs = useQuery({
    queryKey: ["jobs", "queue"],
    queryFn: () => api.listJobs(),
    refetchInterval: hasProcessing ? 3000 : false,
  });
  const queuedCount =
    allJobs.data?.filter((j) => j.state === "queued" || j.state === "running").length ?? 0;
  // 识别中卡片的实时进度(Job.progress 兼容 0-1 与 0-100 两种刻度)
  const progressByScore = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of allJobs.data ?? []) {
      if (j.state !== "running" && j.state !== "queued") continue;
      const p = j.progress <= 1 ? Math.round(j.progress * 100) : Math.round(j.progress);
      m.set(j.scoreId, Math.min(Math.max(p, 0), 100));
    }
    return m;
  }, [allJobs.data]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /// 多选：支持 Shift 范围选（以最近一次点击为锚点，填充到当前项）
  const handleToggleCheck = (id: string, shift: boolean) => {
    if (shift && lastCheckedRef.current && lastCheckedRef.current !== id) {
      const ids = sortedScores.map((s) => s.id);
      const a = ids.indexOf(lastCheckedRef.current);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        });
        lastCheckedRef.current = id;
        return;
      }
    }
    toggleSelect(id);
    lastCheckedRef.current = id;
  };

  const batchRecognize = useMutation({
    mutationFn: () => api.startRecognition([...selected]),
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "queue"] });
    },
  });

  const doImport = useMutation({
    mutationFn: async (paths: string[]) => {
      if (!paths.length) return null;
      return api.importFiles(paths);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      if (res) {
        const skippedNote = res.skipped.length
          ? `，跳过 ${res.skipped.length} 个：${res.skipped
              .slice(0, 3)
              .map((p) => p.split("/").pop())
              .join("、")}${res.skipped.length > 3 ? " 等" : ""}`
          : "";
        showToast(
          { message: `已导入 ${res.imported.length} 个文件${skippedNote}` },
          res.skipped.length ? 8000 : 4000,
        );
      }
    },
    onError: (e) => showToast({ message: `导入失败：${String(e)}` }, 6000),
  });

  const doImportMerged = useMutation({
    mutationFn: (paths: string[]) => api.importMerged(paths),
    onSuccess: () => {
      setFolderFiles(null);
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      showToast({ message: "已合并导入为一首曲子（待识别）" });
    },
    onError: (e) => showToast({ message: `合并导入失败：${String(e)}` }, 6000),
  });

  // 拖拽导入（非 Tauri 环境下不可用，静默降级）
  useEffect(() => {
    let unlisten: Promise<() => void> | null = null;
    try {
      unlisten = getCurrentWebview().onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter") {
          dropDepth.current += 1;
          setDragging(true);
        } else if (p.type === "leave") {
          dropDepth.current -= 1;
          if (dropDepth.current <= 0) setDragging(false);
        } else if (p.type === "drop") {
          dropDepth.current = 0;
          setDragging(false);
          doImport.mutate(p.paths);
        }
      });
    } catch {
      // 非 Tauri 环境（如纯浏览器开发预览）
    }
    return () => {
      unlisten?.then((f) => f()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickAndImport = async () => {
    const paths = await api.pickImportFiles();
    doImport.mutate(paths);
  };

  const confirmDelete = () => {
    if (!confirmState) return;
    if (confirmState.kind === "single") {
      softDeleteScores([confirmState.score.id], `「${confirmState.score.title}」`, queryClient);
    } else {
      softDeleteScores(confirmState.ids, `${confirmState.ids.length} 个曲谱`, queryClient);
      setSelected(new Set());
    }
    setConfirmState(null);
  };

  // 软删除中的曲谱立即从列表隐藏；排序为纯客户端行为
  const visibleScores = useMemo(
    () => scoresList.filter((s) => !pendingDeleteIds.includes(s.id)),
    [scoresList, pendingDeleteIds],
  );
  const sortedScores = useMemo(() => {
    if (sort === "title") {
      return [...visibleScores].sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
    }
    return visibleScores;
  }, [visibleScores, sort]);
  const hasFilter = !!(search || instrument || status);
  const isBatchMode = selected.size > 0;
  // 首次空库时，空态里的「导入乐谱」是唯一主按钮，头部入口让位隐藏
  const isEmptyLibrary = !scores.isLoading && scoresList.length === 0 && !hasFilter;

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hair px-5 py-3">
        {/* 书架题名 */}
        <div className="flex items-baseline gap-2">
          <span className="font-disp text-xl font-black text-bind">曲库</span>
          <span className="text-xs text-bind/55">
            {hasFilter ? `${sortedScores.length} / ${scoresList.length} 册` : `共 ${scoresList.length} 册`}
          </span>
        </div>
        {/* 筛选簇 */}
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={searchRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchInput) {
                e.stopPropagation();
                setSearchInput("");
                setSearch("");
                e.currentTarget.blur();
              }
            }}
            placeholder="搜索标题 / 作曲者…"
            aria-label="搜索标题或作曲者"
            className="w-56 rounded-lg border border-hair-strong bg-paper-bright px-3 py-1.5 text-sm text-bind outline-none placeholder:text-bind/45 focus:border-ink"
          />
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            aria-label="按乐器筛选"
            className="rounded-lg border border-hair-strong bg-paper-bright px-2 py-1.5 text-sm text-bind outline-none focus:border-ink"
          >
            <option value="">全部乐器</option>
            <option value="piano">钢琴</option>
            <option value="guitar">吉他</option>
            <option value="other">其他</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="按状态筛选"
            className="rounded-lg border border-hair-strong bg-paper-bright px-2 py-1.5 text-sm text-bind outline-none focus:border-ink"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "default" | "title")}
            aria-label="排序方式"
            className="rounded-lg border border-hair-strong bg-paper-bright px-2 py-1.5 text-sm text-bind outline-none focus:border-ink"
          >
            <option value="default">排序：添加顺序</option>
            <option value="title">排序：标题</option>
          </select>
        </div>
        <div className="flex-1" />
        {queuedCount > 0 && (
          <span className="rounded-full bg-spot-run/15 px-2.5 py-1 text-xs font-semibold text-spot-run">
            队列 {queuedCount}
          </span>
        )}
        {/* 批量簇：独立容器，与相邻簇保持 16px */}
        {isBatchMode && (
          <div
            className="flex items-center gap-2 rounded-lg border border-hair-strong bg-paper-dim/70 p-1"
            role="group"
            aria-label="批量操作"
          >
            <span className="ml-1.5 text-xs text-bind/60">已选 {selected.size}</span>
            <button
              onClick={() => setSelected(new Set(sortedScores.map((s) => s.id)))}
              className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-bind/70 hover:bg-paper-dim"
            >
              全选
            </button>
            <button
              onClick={() => batchRecognize.mutate()}
              disabled={batchRecognize.isPending}
              className="whitespace-nowrap rounded-md bg-ink px-3 py-1 text-sm font-semibold text-paper hover:bg-ink-bright disabled:opacity-50"
            >
              识别所选
            </button>
            <button
              onClick={() => setConfirmState({ kind: "batch", ids: [...selected] })}
              className="whitespace-nowrap rounded-md border border-spot-fail/40 px-3 py-1 text-sm text-spot-fail hover:bg-spot-fail/10"
            >
              删除所选
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="whitespace-nowrap rounded-md px-3 py-1 text-sm text-bind/70 hover:bg-paper-dim"
            >
              取消
            </button>
          </div>
        )}
        {/* 导入簇：批量模式下让出主按钮位 */}
        {!isEmptyLibrary && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const folder = await api.pickImportFolder();
                if (!folder) return;
                const files = await api.listFolderScores(folder);
                if (!files.length) {
                  showToast({ message: "文件夹里没有找到乐谱图片 / PDF" });
                  return;
                }
                setMergeChecked(files.length > 1);
                setFolderFiles(files);
              }}
              className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm ${
                isBatchMode
                  ? "border-hair-strong text-bind/70 hover:bg-paper-dim"
                  : "border-ink/35 text-ink hover:bg-paper-dim"
              }`}
            >
              导入文件夹
            </button>
            <button
              onClick={pickAndImport}
              className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-semibold ${
                isBatchMode
                  ? "border border-hair-strong text-bind/70 hover:bg-paper-dim"
                  : "bg-ink text-paper shadow-sm hover:bg-ink-bright"
              }`}
            >
              导入乐谱
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto p-5">
        {scores.isLoading ? (
          <div className="grid h-full place-items-center text-sm text-bind/55">加载中…</div>
        ) : visibleScores.length === 0 && scoresList.length === 0 && !hasFilter ? (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              {/* 空谱台 monument:网格上的五线谱与休止符——体系内唯一的展示字形 */}
              <svg width="240" height="130" viewBox="0 0 240 130" fill="none" aria-hidden="true" className="mx-auto">
                <g stroke="#e3dab8" strokeWidth="1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <line key={`v${i}`} x1={20 + i * 20} y1="10" x2={20 + i * 20} y2="120" />
                  ))}
                </g>
                <g stroke="#b9ad8a" strokeWidth="1.5">
                  {[35, 50, 65, 80, 95].map((y) => (
                    <line key={y} x1="20" y1={y} x2="220" y2={y} />
                  ))}
                </g>
                <rect x="128" y="50" width="34" height="11" rx="2" fill="#1e4636" />
                <path d="M162 50 V95" stroke="#1e4636" strokeWidth="2" strokeLinecap="round" />
                <ellipse cx="80" cy="80" rx="11" ry="8" transform="rotate(-20 80 80)" fill="#1e4636" />
                <path
                  d="M90.5 78 V35 c7 2 12 5 12 10"
                  stroke="#1e4636"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <div className="mt-4 text-sm text-bind/70">谱架还是空的</div>
              <div className="mt-1 text-xs text-bind/55">
                把 PDF / PNG / MusicXML / Guitar Pro 文件拖进来，或
              </div>
              <button
                onClick={pickAndImport}
                className="mt-3 rounded-lg bg-ink px-4 py-1.5 text-sm font-semibold text-paper shadow-sm hover:bg-ink-bright"
              >
                导入乐谱
              </button>
            </div>
          </div>
        ) : visibleScores.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="text-center text-bind/60">
              <svg width="150" height="90" viewBox="0 0 150 90" fill="none" aria-hidden="true" className="mx-auto">
                <g stroke="#ddd3b8" strokeWidth="1">
                  {Array.from({ length: 7 }, (_, i) => (
                    <line key={`v${i}`} x1={15 + i * 20} y1="8" x2={15 + i * 20} y2="82" />
                  ))}
                </g>
                <g stroke="#b9ad8a" strokeWidth="1.5">
                  {[25, 37, 49, 61, 73].map((y) => (
                    <line key={y} x1="15" y1={y} x2="135" y2={y} />
                  ))}
                </g>
                <rect x="62" y="31" width="26" height="9" rx="2" fill="#1e4636" />
              </svg>
              <div className="mt-3 text-sm">没有匹配的曲谱</div>
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setInstrument("");
                  setStatus("");
                }}
                className="mt-3 rounded-lg border border-hair-strong px-3 py-1.5 text-sm text-bind/80 hover:bg-paper-dim"
              >
                清除筛选
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4 pr-2">
            {sortedScores.map((s, i) => (
              <ScoreCard
                key={s.id}
                score={s}
                paper={i % 2 === 1}
                progress={progressByScore.get(s.id) ?? null}
                checked={selected.has(s.id)}
                onToggleCheck={(shift) => handleToggleCheck(s.id, shift)}
                onOpen={() => openScore(s.id)}
                onRequestDelete={() => setConfirmState({ kind: "single", score: s })}
              />
            ))}
          </div>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 m-5 grid place-items-center rounded-2xl border-2 border-dashed border-ink bg-paper-bright/75">
          <div className="text-sm font-semibold text-ink">松开以导入乐谱</div>
        </div>
      )}

      {/* 文件夹导入弹窗 */}
      {folderFiles && (
        <div className="anim-fade-in fixed inset-0 z-30 grid place-items-center bg-black/30">
          <div
            ref={folderDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="导入文件夹"
            className="anim-pop-in w-[420px] rounded-xl border border-hair bg-paper-bright p-5 shadow-xl"
          >
            <div className="text-sm font-semibold text-bind">导入文件夹</div>
            <div className="mt-1 text-xs text-bind/60">检测到 {folderFiles.length} 个乐谱文件</div>
            <div className="mt-3 max-h-40 overflow-auto rounded-lg border border-hair bg-paper-dim/60 p-2 text-xs text-bind/70">
              {folderFiles.map((f) => (
                <div key={f} className="truncate py-0.5">
                  {f.split("/").pop()}
                </div>
              ))}
            </div>
            {folderFiles.length > 1 && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-hair p-3 text-sm hover:bg-paper-dim/60">
                <input
                  type="checkbox"
                  checked={mergeChecked}
                  onChange={(e) => setMergeChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#1e4636]"
                />
                <span>
                  <span className="font-semibold text-bind">合并为一首曲子</span>
                  <span className="block text-xs text-bind/60">
                    多张图片按文件名顺序拼接成连续谱面，一次识别（适合分页扫描的同一首）
                  </span>
                </span>
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setFolderFiles(null)}
                disabled={doImportMerged.isPending}
                className="rounded-lg border border-hair-strong px-4 py-1.5 text-sm text-bind/80 hover:bg-paper-dim disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (mergeChecked && folderFiles.length > 1) {
                    doImportMerged.mutate(folderFiles);
                  } else {
                    doImport.mutate(folderFiles);
                    setFolderFiles(null);
                  }
                }}
                disabled={doImportMerged.isPending}
                className="rounded-lg bg-ink px-4 py-1.5 text-sm font-semibold text-paper hover:bg-ink-bright disabled:opacity-50"
              >
                {doImportMerged.isPending ? "导入中…" : "导入"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认（单删 / 批删共用；window.confirm 在 wry 中不可用） */}
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.kind === "batch" ? "删除所选曲谱" : "删除曲谱"}
        message={
          confirmState?.kind === "batch"
            ? `将永久删除所选的 ${confirmState.ids.length} 个曲谱，文件将一并删除。删除后 30 秒内可撤销。`
            : `将永久删除「${confirmState?.kind === "single" ? confirmState.score.title : ""}」，文件将一并删除。删除后 30 秒内可撤销。`
        }
        confirmLabel="删除"
        busy={false}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
