import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api, type Score } from "../lib/tauri";
import { useUi } from "../stores/ui";
import { useDialog } from "../lib/useDialog";
import ConfirmDialog from "../components/ConfirmDialog";

const STATUS_LABEL: Record<Score["status"], string> = {
  imported: "待识别",
  processing: "识别中",
  ready: "可播放",
  failed: "识别失败",
};

const STATUS_STYLE: Record<Score["status"], string> = {
  imported: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
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

function ScoreCard({
  score,
  checked,
  onToggleCheck,
  onOpen,
  onRequestDelete,
}: {
  score: Score;
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

  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md">
      {/* 多选框（左上角常驻；DOM 在前保证键盘顺序 = 视觉顺序） */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(e.shiftKey);
        }}
        aria-label={checked ? `取消选择 ${score.title}` : `选择 ${score.title}`}
        className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border text-xs shadow ${
          checked
            ? "border-indigo-600 bg-indigo-600 text-white"
            : "border-zinc-300 bg-white/90 text-transparent hover:text-zinc-400"
        }`}
      >
        ✓
      </button>
      <button onClick={onOpen} className="block w-full text-left">
        <div className="grid h-36 place-items-center bg-zinc-100">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="max-h-36 w-full object-cover" />
          ) : (
            /// 无封面占位：五线谱 + 四分音符（手绘 SVG，与领域同源）
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
              {[14, 21, 28, 35, 42].map((y) => (
                <line key={y} x1="7" y1={y} x2="49" y2={y} stroke="#d4d4d8" strokeWidth="1.5" strokeLinecap="round" />
              ))}
              <ellipse cx="33" cy="33.5" rx="5.5" ry="4.2" transform="rotate(-20 33 33.5)" fill="#a1a1aa" />
              <path
                d="M38 32.5 V11.5 c4.5 1.2 7.5 3.2 7.5 6.2"
                stroke="#a1a1aa"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
        </div>
        <div className="p-3">
          <div className="truncate text-sm font-semibold" title={score.title}>
            {score.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <span>{INSTRUMENT_LABEL[score.instrument] ?? "其他"}</span>
            <span className={STATUS_STYLE[score.status]}>
              {score.status === "processing" ? "识别中…" : STATUS_LABEL[score.status]}
            </span>
          </div>
          {score.errorMessage && (
            <div
              className="mt-1 truncate select-text text-xs text-red-600"
              title={score.errorMessage}
            >
              {score.errorMessage}
            </div>
          )}
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {canRecognize && (
          <button
            onClick={() => recognize.mutate()}
            className="rounded-md bg-white/90 px-2 py-1 text-xs text-indigo-600 shadow hover:bg-indigo-50"
          >
            识别
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete();
          }}
          className="rounded-md bg-white/90 px-2 py-1 text-xs text-red-600 shadow hover:bg-red-50"
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

  // 识别队列状态（用于角标展示）——仅在曲库中有识别任务进行中时轮询
  const scoresList = useMemo(() => scores.data ?? [], [scores.data]);
  const hasProcessing = scoresList.some((s) => s.status === "processing");
  const allJobs = useQuery({
    queryKey: ["jobs", "queue"],
    queryFn: () => api.listJobs(),
    refetchInterval: hasProcessing ? 3000 : false,
  });
  const queuedCount =
    allJobs.data?.filter((j) => j.state === "queued" || j.state === "running").length ?? 0;

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
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-5 py-3">
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
            className="w-56 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            aria-label="按乐器筛选"
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none"
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
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none"
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
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none"
          >
            <option value="default">排序：添加顺序</option>
            <option value="title">排序：标题</option>
          </select>
        </div>
        <div className="flex-1" />
        {queuedCount > 0 && (
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-700">
            队列 {queuedCount}
          </span>
        )}
        {/* 批量簇：独立容器，与相邻簇保持 16px */}
        {isBatchMode && (
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1" role="group" aria-label="批量操作">
            <span className="ml-1.5 text-xs text-zinc-500">已选 {selected.size}</span>
            <button
              onClick={() => setSelected(new Set(sortedScores.map((s) => s.id)))}
              className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
            >
              全选
            </button>
            <button
              onClick={() => batchRecognize.mutate()}
              disabled={batchRecognize.isPending}
              className="whitespace-nowrap rounded-md bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              识别所选
            </button>
            <button
              onClick={() => setConfirmState({ kind: "batch", ids: [...selected] })}
              className="whitespace-nowrap rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              删除所选
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="whitespace-nowrap rounded-md px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
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
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                isBatchMode
                  ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  : "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              导入文件夹
            </button>
            <button
              onClick={pickAndImport}
              className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm ${
                isBatchMode
                  ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  : "bg-indigo-600 text-white shadow hover:bg-indigo-500"
              }`}
            >
              导入乐谱
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto p-5">
        {scores.isLoading ? (
          <div className="grid h-full place-items-center text-sm text-zinc-500">加载中…</div>
        ) : visibleScores.length === 0 && scoresList.length === 0 && !hasFilter ? (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <div className="text-4xl">🎼</div>
              <div className="mt-2 text-sm text-zinc-500">曲库还是空的</div>
              <div className="mt-1 text-xs text-zinc-500">
                把 PDF / PNG / MusicXML / Guitar Pro 文件拖进来，或
              </div>
              <button
                onClick={pickAndImport}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white shadow hover:bg-indigo-500"
              >
                导入乐谱
              </button>
            </div>
          </div>
        ) : visibleScores.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="text-center text-zinc-500">
              <div className="text-4xl">🔍</div>
              <div className="mt-2 text-sm">没有匹配的曲谱</div>
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setInstrument("");
                  setStatus("");
                }}
                className="mt-3 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                清除筛选
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {sortedScores.map((s) => (
              <ScoreCard
                key={s.id}
                score={s}
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
        <div className="pointer-events-none absolute inset-0 z-10 m-5 grid place-items-center rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/70">
          <div className="text-sm font-semibold text-indigo-600">松开以导入乐谱</div>
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
            className="anim-pop-in w-[420px] rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="text-sm font-semibold">导入文件夹</div>
            <div className="mt-1 text-xs text-zinc-500">
              检测到 {folderFiles.length} 个乐谱文件
            </div>
            <div className="mt-3 max-h-40 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600">
              {folderFiles.map((f) => (
                <div key={f} className="truncate py-0.5">
                  {f.split("/").pop()}
                </div>
              ))}
            </div>
            {folderFiles.length > 1 && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50">
                <input
                  type="checkbox"
                  checked={mergeChecked}
                  onChange={(e) => setMergeChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="font-semibold">合并为一首曲子</span>
                  <span className="block text-xs text-zinc-500">
                    多张图片按文件名顺序拼接成连续谱面，一次识别（适合分页扫描的同一首）
                  </span>
                </span>
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setFolderFiles(null)}
                disabled={doImportMerged.isPending}
                className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
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
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
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
