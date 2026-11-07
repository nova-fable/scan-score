import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlphaTabApi, midi, model } from "@coderline/alphatab";
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

  // 原图对照（pdf/png 源）
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    if (!s?.originalPath || !["png", "jpg", "pdf"].includes(s.sourceType)) return;
    let url: string | null = null;
    api
      .readScoreAsset(s.originalPath)
      .then((bytes) => {
        const mime =
          s.sourceType === "pdf"
            ? "application/pdf"
            : s.sourceType === "png"
              ? "image/png"
              : "image/jpeg";
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        setOriginalUrl(url);
      })
      .catch(() => setOriginalUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [s?.originalPath, s?.sourceType]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-5 py-3">
        <button
          onClick={openLibrary}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
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
            <button
              onClick={() => exportMidi()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出 MIDI
            </button>
            <button
              onClick={() => exportSource()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出乐谱文件
            </button>
          </>
        )}
        {canRecognize && (
          <button
            onClick={() => recognize.mutate()}
            disabled={s?.status === "processing"}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            {s?.status === "processing" ? "识别中…" : "开始识别 / 重新识别"}
          </button>
        )}
        {originalUrl && (
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {showOriginal ? "显示识别谱" : "对照原图"}
          </button>
        )}
        <button
          onClick={() => del.mutate()}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
        >
          删除
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
            <div className="mb-1 text-xs text-zinc-500">原图对照</div>
            {s?.sourceType === "pdf" ? (
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
    </div>
  );
}
