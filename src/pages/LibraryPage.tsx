import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api, type Score } from "../lib/tauri";
import { useUi } from "../stores/ui";

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

const INSTRUMENT_LABEL: Record<string, string> = {
  piano: "钢琴",
  guitar: "吉他",
  other: "其他",
};

function ScoreCard({ score, onOpen }: { score: Score; onOpen: () => void }) {
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

  const del = useMutation({
    mutationFn: () => api.deleteScore(score.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scores"] }),
  });

  const canRecognize =
    (score.sourceType === "pdf" || score.sourceType === "png" || score.sourceType === "jpg") &&
    score.status !== "processing";

  const recognize = useMutation({
    mutationFn: () => api.startRecognition([score.id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scores"] }),
  });

  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="grid h-36 place-items-center bg-zinc-100">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="max-h-36 w-full object-cover" />
          ) : (
            <span className="text-3xl text-zinc-300">♫</span>
          )}
        </div>
        <div className="p-3">
          <div className="truncate text-sm font-medium" title={score.title}>
            {score.title}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
            <span>{INSTRUMENT_LABEL[score.instrument] ?? "其他"}</span>
            <span className={STATUS_STYLE[score.status]}>
              {score.status === "processing" ? "识别中…" : STATUS_LABEL[score.status]}
            </span>
          </div>
          {score.errorMessage && (
            <div className="mt-1 truncate text-[11px] text-red-500" title={score.errorMessage}>
              {score.errorMessage}
            </div>
          )}
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
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
            del.mutate();
          }}
          className="rounded-md bg-white/90 px-2 py-1 text-xs text-red-500 shadow hover:bg-red-50"
        >
          删除
        </button>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const openScore = useUi((s) => s.openScore);
  const [search, setSearch] = useState("");
  const [instrument, setInstrument] = useState("");
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const dropDepth = useRef(0);
  const [folderFiles, setFolderFiles] = useState<string[] | null>(null);
  const [mergeChecked, setMergeChecked] = useState(true);

  const scores = useQuery({
    queryKey: ["scores", search, instrument],
    queryFn: () => api.listScores({ query: search || undefined, instrument: instrument || undefined }),
  });

  const doImport = useMutation({
    mutationFn: async (paths: string[]) => {
      if (!paths.length) return null;
      return api.importFiles(paths);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      if (res) {
        setImportMsg(`已导入 ${res.imported.length} 个文件${res.skipped.length ? `，跳过 ${res.skipped.length} 个` : ""}`);
        setTimeout(() => setImportMsg(null), 4000);
      }
    },
  });

  const doImportMerged = useMutation({
    mutationFn: (paths: string[]) => api.importMerged(paths),
    onSuccess: () => {
      setFolderFiles(null);
      queryClient.invalidateQueries({ queryKey: ["scores"] });
      setImportMsg("已合并导入为一首曲子（待识别）");
      setTimeout(() => setImportMsg(null), 4000);
    },
    onError: (e) => {
      setImportMsg(`合并导入失败：${String(e)}`);
      setTimeout(() => setImportMsg(null), 5000);
    },
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

  const scoresList = useMemo(() => scores.data ?? [], [scores.data]);

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索标题 / 作曲者…"
          className="w-64 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
        />
        <select
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none"
        >
          <option value="">全部乐器</option>
          <option value="piano">钢琴</option>
          <option value="guitar">吉他</option>
          <option value="other">其他</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={async () => {
            const folder = await api.pickImportFolder();
            if (!folder) return;
            const files = await api.listFolderScores(folder);
            if (!files.length) {
              setImportMsg("文件夹里没有找到乐谱图片 / PDF");
              setTimeout(() => setImportMsg(null), 4000);
              return;
            }
            setMergeChecked(files.length > 1);
            setFolderFiles(files);
          }}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          导入文件夹
        </button>
        <button
          onClick={async () => {
            const paths = await api.pickImportFiles();
            doImport.mutate(paths);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-indigo-500"
        >
          导入乐谱
        </button>
      </header>

      <div className="flex-1 overflow-auto p-5">
        {scores.isLoading ? (
          <div className="grid h-full place-items-center text-sm text-zinc-400">加载中…</div>
        ) : scoresList.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="text-center text-zinc-400">
              <div className="text-4xl">🎼</div>
              <div className="mt-2 text-sm">曲库还是空的</div>
              <div className="mt-1 text-xs">
                点击「导入乐谱」或把 PDF / PNG / MusicXML / Guitar Pro 文件拖进来
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {scoresList.map((s) => (
              <ScoreCard key={s.id} score={s} onOpen={() => openScore(s.id)} />
            ))}
          </div>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 m-5 grid place-items-center rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/70">
          <div className="text-lg font-medium text-indigo-600">松开以导入乐谱</div>
        </div>
      )}
      {importMsg && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white shadow">
          {importMsg}
        </div>
      )}

      {/* 文件夹导入弹窗 */}
      {folderFiles && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/30">
          <div className="w-[420px] rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-base font-semibold">导入文件夹</div>
            <div className="mt-1 text-xs text-zinc-400">
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
                  <span className="font-medium">合并为一首曲子</span>
                  <span className="block text-xs text-zinc-400">
                    多张图片按文件名顺序拼接成连续谱面，一次识别（适合分页扫描的同一首）
                  </span>
                </span>
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setFolderFiles(null)}
                className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
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
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {doImportMerged.isPending ? "导入中…" : "导入"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
