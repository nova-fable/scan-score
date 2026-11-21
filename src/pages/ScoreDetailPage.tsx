import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlphaTabApi, LayoutMode, midi, model } from "@coderline/alphatab";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, readAssetBytes, type PracticeState, type Score } from "../lib/tauri";
import { analyzeSheetLayout, type SheetSystem } from "../lib/sheet-layout";
import { useT } from "../lib/i18n";
import { useUi } from "../stores/ui";
import { useDialog, useDismissOnEsc } from "../lib/useDialog";
import ScoreViewer, { type FollowMode } from "../components/ScoreViewer";
import PlayerBar from "../components/PlayerBar";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  IconCaretDown,
  IconCaretLeft,
  IconCaretRight,
  IconClose,
  IconEdit,
  IconLayoutHorizontal,
  IconLayoutPage,
  IconMoon,
  IconOverflow,
  IconSun,
} from "../components/icons";

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

/// 夜间看谱是环境偏好（同一间屋子的所有谱共用），不是单曲练习状态。
/// 用 localStorage 同步读取：进页第一帧就是暗的，不会先闪一下整屏白光。
const NIGHT_KEY = "scanscore.viewerNight";

/// 播放跟随方式同样是阅读习惯（不是单曲属性），与夜间模式一起走 localStorage
const FOLLOW_KEY = "scanscore.scrollFollow";

/// 导出文件名消毒：Windows 禁用字符（/ \ : * ? " < > |）与首尾空白
const safeName = (s: string) =>
  s.replace(/[\\/:*?"<>|]/g, "_").trim().replace(/^\.+/, "_") || "score";

export default function ScoreDetailPage({ scoreId }: { scoreId: string }) {
  const t = useT();
  const openLibrary = useUi((s) => s.openLibrary);
  const openScore = useUi((s) => s.openScore);
  const softDeleteScores = useUi((s) => s.softDeleteScores);
  const showToast = useUi((s) => s.showToast);
  const queryClient = useQueryClient();
  const [atApi, setAtApi] = useState<AlphaTabApi | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState({ currentTimeMs: 0, endTimeMs: 0 });
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [loadKey, setLoadKey] = useState(0); // 重新识别后强制重载
  const scoreModelRef = useRef<model.Score | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [layout, setLayout] = useState<"page" | "horizontal">("page");
  // 暗场看谱：整页（谱面 + 头部 + 播放条）压低照度，扫描件默认反色
  const [night, setNight] = useState(() => localStorage.getItem(NIGHT_KEY) === "1");
  // 扫描件反色：跟随夜间，可单独关（带批注/暖纸底的扫描件反转后不一定更好读）
  const [invertScanOverride, setInvertScanOverride] = useState<boolean | null>(null);
  const invertScan = invertScanOverride ?? night;
  const toggleNight = () => {
    const next = !night;
    setNight(next);
    localStorage.setItem(NIGHT_KEY, next ? "1" : "0");
  };
  // 循环练习中：查看器的位置指示加重（父级不持有 PlayerBar 的循环状态，靠上报同步）
  const [loopActive, setLoopActive] = useState(false);
  // 播放跟随方式：逐行跟随（默认）/ 按需翻页
  const [follow, setFollow] = useState<FollowMode>(
    () => (localStorage.getItem(FOLLOW_KEY) === "onDemand" ? "onDemand" : "line"),
  );
  const changeFollow = (next: FollowMode) => {
    setFollow(next);
    localStorage.setItem(FOLLOW_KEY, next);
  };

  // 元数据编辑
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", composer: "", instrument: "other", tags: "" });

  const score = useQuery({
    queryKey: ["score", scoreId],
    queryFn: () => api.getScore(scoreId),
  });

  // 练习状态：跨会话按曲子恢复（速度/音量/循环/布局/缩放/A-B）
  const practice = useQuery({
    queryKey: ["practice", scoreId],
    queryFn: () => api.getPracticeState(scoreId),
  });
  const atApiRef = useRef<AlphaTabApi | null>(null);
  const practiceRef = useRef<PracticeState | null>(null);
  // 打印导出用:包住 ScoreViewer 以便收集渲染好的谱面 SVG
  const viewerRef = useRef<HTMLDivElement | null>(null);
  practiceRef.current = practice.data ?? null;

  // 跨会话恢复的循环状态也要点亮查看器的位置指示
  useEffect(() => {
    if (practice.data) setLoopActive(practice.data.loopEnabled);
  }, [practice.data]);

  type PracticePatch = Partial<Omit<PracticeState, "abStart" | "abEnd">> & {
    ab?: { startTick: number; endTick: number } | null;
  };
  const practiceDraftRef = useRef<PracticePatch>({});
  const practiceTimerRef = useRef<number | undefined>(undefined);

  const schedulePractice = (patch: PracticePatch) => {
    if (patch.loopEnabled !== undefined) setLoopActive(patch.loopEnabled);
    Object.assign(practiceDraftRef.current, patch);
    if (practiceTimerRef.current !== undefined) clearTimeout(practiceTimerRef.current);
    practiceTimerRef.current = window.setTimeout(() => {
      const base: PracticeState = practiceRef.current ?? {
        speed: 1,
        volume: 1,
        loopEnabled: false,
        layout: "page",
        scale: 1,
        abStart: null,
        abEnd: null,
        metronomeEnabled: false,
        metronomeVolume: 1.5,
        countInEnabled: false,
      };
      const draft = practiceDraftRef.current;
      const next: PracticeState = {
        speed: draft.speed ?? base.speed,
        volume: draft.volume ?? base.volume,
        loopEnabled: draft.loopEnabled ?? base.loopEnabled,
        layout: draft.layout ?? base.layout,
        scale: draft.scale ?? base.scale,
        abStart: draft.ab === undefined ? base.abStart : (draft.ab?.startTick ?? null),
        abEnd: draft.ab === undefined ? base.abEnd : (draft.ab?.endTick ?? null),
        metronomeEnabled: draft.metronomeEnabled ?? base.metronomeEnabled,
        metronomeVolume: draft.metronomeVolume ?? base.metronomeVolume,
        countInEnabled: draft.countInEnabled ?? base.countInEnabled,
      };
      practiceDraftRef.current = {};
      practiceRef.current = next;
      api.setPracticeState(scoreId, next).catch(() => {
        // 落库失败静默：练习状态是尽力而为的恢复
      });
    }, 400);
  };

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
    mutationFn: async () => {
      await api.updateScore(
        scoreId,
        draft.title || s?.title || "未命名",
        draft.composer || undefined,
        draft.instrument,
      );
      // 标签:顿号/逗号/空格分隔
      await api.set_score_tags(
        scoreId,
        draft.tags.split(/[,，、\s]+/).filter(Boolean),
      );
    },
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
    const target = await api.pickSavePath(`${safeName(s?.title ?? "score")}.mid`, "mid");
    if (target) {
      await api.writeExportBytes(target, bytes);
    }
  };

  const exportSource = async () => {
    if (!s) return;
    const isGp = s.sourceType === "gp";
    const ext = isGp ? "gp" : "xml";
    const target = await api.pickSavePath(`${safeName(s.title)}.${ext}`, ext);
    if (target) {
      await api.exportScoreSource(s.id, target);
    }
  };

  /// 导出谱面打印版:收集渲染好的 SVG → 独立 HTML(每页一版式)→ 数据目录 exports/,浏览器打开后 ⌘P
  const exportPrint = async () => {
    if (!s) return;
    const svgs = viewerRef.current?.querySelectorAll("svg");
    if (!svgs || svgs.length === 0) {
      showToast({ message: t("谱面还没渲染完成,稍后再试") });
      return;
    }
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const body = Array.from(svgs)
      .map((svg) => svg.outerHTML)
      .join("\n");
    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(s.title)} · 打印版</title>
<style>
@page { margin: 12mm }
body { margin: 0; background: #fff; font-family: Georgia, "Songti SC", serif; }
h1 { text-align: center; font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
.sub { text-align: center; color: #666; font-size: 13px; margin: 0 0 20px; }
svg { display: block; margin: 0 auto; max-width: 100%; height: auto; break-after: page; page-break-after: always; }
</style></head><body>
<h1>${esc(s.title)}</h1>
<p class="sub">${esc(s.composer ?? "")} ScanScore 打印版</p>
${body}
</body></html>`;
    const path = await api.exportPrintHtml(scoreId, s.title, html);
    await api.openScoreAsset(path);
    showToast({ message: t("打印版已在浏览器打开,⌘P 即可打印") });
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

  // 原图点击定位小节:谱线行聚类找系统 + 带内竖线找小节线;
  // 小节数按均匀分布估(每系统 = ceil(总小节/系统数)),估偏了在跳转框里手调。
  const atxSystemsRef = useRef<{ src: string; systems: SheetSystem[] } | null>(null);
  const [atxAnalyzing, setAtxAnalyzing] = useState(false);
  const estimateBarFromClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const src = atxImageUrl;
    if (!src) return;
    let systems = atxSystemsRef.current?.src === src ? atxSystemsRef.current.systems : null;
    if (!systems) {
      setAtxAnalyzing(true);
      try {
        const img = new Image();
        img.src = src;
        await img.decode();
        systems = analyzeSheetLayout(img);
        atxSystemsRef.current = { src, systems: systems ?? [] };
      } catch {
        systems = null;
      } finally {
        setAtxAnalyzing(false);
      }
      if (!systems || systems.length === 0) {
        showToast({ message: t("这张图没分析出谱线系统,无法点击定位") }, 4000);
        return;
      }
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * e.currentTarget.naturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * e.currentTarget.naturalHeight;
    let sysIdx = systems.findIndex((sys) => y >= sys.top - 14 && y <= sys.bottom + 14);
    if (sysIdx < 0) {
      sysIdx = 0;
      let best = Infinity;
      systems.forEach((sys, i) => {
        const d = Math.abs(y - (sys.top + sys.bottom) / 2);
        if (d < best) {
          best = d;
          sysIdx = i;
        }
      });
    }
    const sys = systems[sysIdx];
    const internal = sys.barlines.filter((bx) => bx < x);
    const barInSystem = Math.max(0, internal.length - 1); // 扣掉系统起始线
    const per = Math.ceil(atxBarCount / systems.length);
    const guess = Math.max(1, Math.min(atxBarCount, sysIdx * per + barInSystem + 1));
    setAtxJumpTo(String(guess));
    goToBar(guess);
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
        return t("待识别：导入的扫描件尚未进行光学识别");
      case "processing":
        return t("识别中… {p}% {msg}", {
          p: runningJob ? runningJob.progress : "",
          msg: runningJob?.message ?? "",
        });
      case "ready":
        return t("可播放");
      case "failed":
        return t("识别失败：{e}", { e: s.errorMessage ?? t("未知错误") });
    }
  }, [s, runningJob, t]);

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
      } else if (/^[1-9]$/.test(e.key)) {
        // 数字键跳小节:第 n 小节起点(谱面通常不超过 9 小节一屏,配合 Shift+滚轮/拖动够用)
        const bar = atApi.score?.masterBars[Number(e.key) - 1];
        if (bar) {
          e.preventDefault();
          atApi.player.tickPosition = bar.start;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [atApi, playing, isPlayable, showAtxEditor, showLog, editing]);

  // 练习时长追踪:真正播放时累计,每 30 秒落一条 practice_log;暂停/离开把 ≥5 秒的尾巴也落掉
  const playedSecondsRef = useRef(0);
  useEffect(() => {
    if (!playing || !isPlayable) return;
    const t = window.setInterval(() => {
      playedSecondsRef.current += 5;
      if (playedSecondsRef.current >= 30) {
        api.add_practice_time(scoreId, playedSecondsRef.current).catch(() => {});
        playedSecondsRef.current = 0;
      }
    }, 5000);
    return () => {
      window.clearInterval(t);
      if (playedSecondsRef.current >= 5) {
        api.add_practice_time(scoreId, playedSecondsRef.current).catch(() => {});
        playedSecondsRef.current = 0;
      }
    };
  }, [playing, isPlayable, scoreId]);
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
    ...(isPlayable
      ? [{ label: t("导出打印页"), onClick: () => exportPrint() }]
      : []),
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
            label: t("日志"),
            onClick: async () => {
              const last = jobs.data![0];
              const log = await api.readJobLog(last.id);
              setLogText(log ?? t("（该任务无日志记录）"));
              setShowLog(true);
            },
          },
        ]
      : []),
    ...(s?.status === "failed" && (s.errorMessage ?? "").includes("六线谱")
      ? [
          {
            label: t("找 Guitar Pro 版本 ↗"),
            onClick: () =>
              openUrl(
                `https://www.songsterr.com/a/wa/search?pattern=${encodeURIComponent(s.title)}`,
              ),
          },
        ]
      : []),
    {
      label: t("删除曲谱"),
      danger: true,
      onClick: () => setConfirmingDelete(true),
    },
  ];
  // 加入歌单:每个现有歌单一个入口(新建在歌单页做)
  const playlists = useQuery({
    queryKey: ["playlists"],
    queryFn: () => api.list_playlists(),
  });
  for (const p of playlists.data ?? []) {
    overflowItems.unshift({
      label: t("加入歌单 · {t}", { t: p.name }),
      onClick: async () => {
        await api.add_to_playlist(p.id, scoreId);
        queryClient.invalidateQueries({ queryKey: ["playlists"] });
        showToast({ message: t("已加入歌单「{t}」", { t: p.name }) });
      },
    });
  }

  return (
    <div className={`flex h-full flex-col bg-paper ${night ? "night" : ""}`}>
      <header className="flex items-center gap-3 border-b border-hair px-5 py-3">
        <button
          onClick={openLibrary}
          className="shrink-0 whitespace-nowrap rounded-lg border border-hair-strong px-2.5 py-1.5 text-sm text-bind/80 hover:bg-paper-dim"
        >
          {t("← 曲库")}
        </button>
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMeta.mutate();
              }}
              placeholder={t("标题")}
              aria-label={t("标题")}
              className="w-48 rounded-lg border border-hair-strong bg-paper-bright px-2 py-1 text-sm text-bind outline-none focus:border-ink"
            />
            <input
              value={draft.composer}
              onChange={(e) => setDraft((d) => ({ ...d, composer: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMeta.mutate();
              }}
              placeholder={t("作曲者")}
              aria-label={t("作曲者")}
              className="w-36 rounded-lg border border-hair-strong bg-paper-bright px-2 py-1 text-sm text-bind outline-none focus:border-ink"
            />
            <input
              value={draft.tags}
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveMeta.mutate();
              }}
              placeholder={t("标签（顿号分隔）")}
              aria-label={t("标签")}
              className="w-40 rounded-lg border border-hair-strong bg-paper-bright px-2 py-1 text-sm text-bind outline-none placeholder:text-bind/40 focus:border-ink"
            />
            <select
              value={draft.instrument}
              onChange={(e) => setDraft((d) => ({ ...d, instrument: e.target.value }))}
              aria-label="乐器"
              className="rounded-lg border border-hair-strong bg-paper-bright px-1 py-1 text-sm text-bind"
            >
              <option value="piano">{t("钢琴")}</option>
              <option value="guitar">{t("吉他")}</option>
              <option value="other">{t("其他")}</option>
            </select>
            <button
              onClick={() => saveMeta.mutate()}
              className="rounded-lg bg-ink px-3 py-1 text-sm font-semibold text-paper hover:bg-ink-bright"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-hair-strong px-3 py-1 text-sm text-bind/70"
            >
              {t("取消")}
            </button>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate font-disp text-lg font-black text-bind" title={s?.title}>
                {s?.title ?? "…"}
              </div>
              {s && (
                <button
                  onClick={() => {
                    setDraft({
                      title: s.title,
                      composer: s.composer ?? "",
                      instrument: s.instrument,
                      tags: s.tags.join("、"),
                    });
                    setEditing(true);
                  }}
                  className="text-xs text-bind/40 transition hover:text-ink"
                  title={t("编辑信息")}
                  aria-label={t("编辑信息")}
                >
                  <IconEdit size={13} />
                </button>
              )}
            </div>
            <div className="truncate text-xs text-bind/60 select-text">
              {s ? `${INSTRUMENT_LABEL[s.instrument] ?? "其他"} · ` : ""}
              {s?.composer ? `${s.composer} · ` : ""}
              {statusText}
              {s?.tags?.length ? ` · ${s.tags.map((t) => `#${t}`).join(" ")}` : ""}
            </div>
          </div>
        )}
        <div className="flex-1" />
        {/* 次级簇（内距 8px），识别主按钮独立在簇外 12px */}
        <div className="flex items-center gap-2">
          {/* 夜间看谱：环境需求是「此刻」的，必须一眼可切；放在头部而不是查看器悬浮簇，
              未识别/识别失败的暗场页面里也要能切回日间 */}
          <button
            onClick={toggleNight}
            aria-label={night ? t("切换到日间看谱") : t("切换到夜间看谱")}
            title={t("夜间看谱")}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm ${
              night
                ? "border-ink/50 bg-ink/10 font-semibold text-ink"
                : "border-hair-strong text-bind/80 hover:bg-paper-dim"
            }`}
          >
            {night ? <IconSun size={13} /> : <IconMoon size={13} />}
            {night ? t("日间") : t("夜间")}
          </button>
          {originalUrl && (
            <OriginalMenu
              active={showOriginal}
              onToggle={() => setShowOriginal((v) => !v)}
              onOpenExternal={() => {
                if (!originalAssetPath) return;
                api.openScoreAsset(originalAssetPath).catch((e) => {
                  showToast({ message: String(e) }, 6000);
                });
              }}
            />
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
            className="shrink-0 whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-paper hover:bg-ink-bright disabled:opacity-50"
          >
            {s?.status === "processing"
              ? t("识别中…")
              : s?.status === "imported"
                ? t("开始识别")
                : t("重新识别")}
          </button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {isPlayable ? (
          asset.isError ? (
            <div className="grid flex-1 place-items-center text-sm text-spot-fail">
              {t("乐谱文件读取失败")}
            </div>
          ) : !asset.data ? (
            <div className="grid flex-1 place-items-center text-sm text-bind/55">{t("加载乐谱…")}</div>
          ) : (
            <div ref={viewerRef} className="contents">
            <ScoreViewer
              key={`${assetPath}-${loadKey}`}
              data={asset.data}
              night={night}
              loopActive={loopActive}
              follow={follow}
              onReady={(a) => {
                atApiRef.current = a;
                setAtApi(a);
              }}
              callbacks={{
                onScoreLoaded: (score, trackInfos) => {
                  scoreModelRef.current = score;
                  setTracks(trackInfos.map(({ name, track }) => ({ track, name, muted: false })));
                  // 恢复练习状态（A-B 按 endTick 校验：重新识别后 tick 失效则跳过）
                  const p = practiceRef.current;
                  const a = atApiRef.current;
                  if (a?.player && p) {
                    try {
                      a.player.playbackSpeed = p.speed;
                      a.player.masterVolume = p.volume;
                      if (p.layout === "horizontal") {
                        a.settings.display.layoutMode = LayoutMode.Horizontal;
                        a.updateSettings();
                        a.render();
                        setLayout("horizontal");
                      }
                      if (Math.abs(p.scale - 1) > 1e-6) {
                        a.settings.display.scale = p.scale;
                        a.updateSettings();
                        a.render();
                        setScale(p.scale);
                      }
                      if (p.abStart != null && p.abEnd != null && p.abEnd <= a.endTick) {
                        a.player.playbackRange = { startTick: p.abStart, endTick: p.abEnd };
                        a.player.isLooping = p.loopEnabled;
                      }
                    } catch {
                      // 状态恢复失败不阻断播放
                    }
                  }
                },
                onPlayerState: setPlaying,
                onPosition: (currentTimeMs, endTimeMs) => setPosition({ currentTimeMs, endTimeMs }),
                onFinished: () => {
                  setPlaying(false);
                  // 连播队列:歌单「连播」进入后,播完自动切下一首
                  const next = useUi.getState().advancePlayQueue();
                  if (next) openScore(next);
                },
              }}
            />
            </div>
          )
        ) : (
          <div className="grid flex-1 place-items-center bg-paper-dim/40 px-6 text-center">
            {s?.status === "processing" ? (
              <div className="text-bind/60">
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
                  <rect x="46" y="25" width={`${Math.max(8, Math.min(58, ((runningJob?.progress ?? 0) / 100) * 58))}`} height="9" rx="2" fill="#2a5580" />
                </svg>
                <div className="mt-3 text-sm">
                  {t("正在识别，进度 {p}%", { p: runningJob?.progress ?? 0 })}
                </div>
                <div className="mt-1 max-w-md truncate select-text text-xs text-bind/55">
                  {runningJob?.message ?? "…"}
                </div>
                <button
                  onClick={async () => {
                    if (runningJob) {
                      await api.cancelRecognition(runningJob.id);
                    }
                  }}
                  className="mt-4 rounded-lg border border-hair-strong px-3 py-1.5 text-sm text-bind/80 hover:bg-paper-dim"
                >
                  {t("取消识别")}
                </button>
              </div>
            ) : (
              <div className="text-bind/60">
                <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true" className="mx-auto">
                  <rect x="30" y="10" width="60" height="80" rx="3" fill="#fffdf4" stroke="#b9ad8a" strokeWidth="1.5" />
                  <g stroke="#ddd3b8" strokeWidth="1.5">
                    {[35, 45, 55, 65, 75].map((y) => (
                      <line key={y} x1="40" y1={y} x2="80" y2={y} />
                    ))}
                  </g>
                  <path d="M42 30 h20 M42 42 h26 M42 54 h14" stroke="#c1b58e" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <div className="mx-auto mt-3 max-w-md select-text text-sm">
                  {s?.status === "failed"
                    ? t("识别失败：{e}", { e: s.errorMessage ?? t("未知错误") })
                    : t("这份谱还没有识别，点击上方「开始识别」")}
                </div>
                {canRecognize && (
                  <button
                    onClick={() => recognize.mutate()}
                    className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink-bright"
                  >
                    {t("开始识别")}
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
            className="absolute right-5 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-hair bg-paper-bright/95 px-1 py-0.5 shadow-sm"
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
                schedulePractice({ scale: atApi.settings.display.scale });
              }}
              disabled={scaleValue <= 0.51}
              aria-label={t("缩小")}
              className="px-2 py-1 text-sm text-bind/70 hover:text-ink disabled:opacity-40"
            >
              −
            </button>
            <span className="w-10 text-center text-micro text-bind/55">
              {Math.round(scaleValue * 100)}%
            </span>
            <button
              onClick={() => {
                if (!atApi) return;
                atApi.settings.display.scale = Math.min(2.5, atApi.settings.display.scale + 0.2);
                atApi.updateSettings();
                atApi.render();
                setScale(atApi.settings.display.scale);
                schedulePractice({ scale: atApi.settings.display.scale });
              }}
              disabled={scaleValue >= 2.49}
              aria-label={t("放大")}
              className="px-2 py-1 text-sm text-bind/70 hover:text-ink disabled:opacity-40"
            >
              ＋
            </button>
            <span className="mx-1 h-4 w-px bg-hair" />
            <button
              onClick={() => {
                if (!atApi) return;
                const next = layout === "page" ? LayoutMode.Horizontal : LayoutMode.Page;
                atApi.settings.display.layoutMode = next;
                atApi.updateSettings();
                atApi.render();
                setLayout(next === LayoutMode.Horizontal ? "horizontal" : "page");
                schedulePractice({ layout: next === LayoutMode.Horizontal ? "horizontal" : "page" });
              }}
              aria-label={t("切换滚动方向")}
              title={t("切换滚动方向")}
              className="flex items-center gap-1 px-2 py-1 text-xs text-bind/70 hover:text-ink"
            >
              {layout === "page" ? (
                <>
                  <IconLayoutHorizontal size={12} /> {t("横向")}
                </>
              ) : (
                <>
                  <IconLayoutPage size={12} /> {t("分页")}
                </>
              )}
            </button>
            <span className="mx-1 h-4 w-px bg-hair" />
            {/* 播放跟随方式：只影响播放时的自动滚动，不改谱面本身 */}
            <select
              value={follow}
              onChange={(e) => changeFollow(e.target.value as FollowMode)}
              aria-label="播放跟随方式"
              title="播放时谱面的跟随方式"
              className="cursor-pointer rounded bg-transparent py-1 pl-1 pr-0.5 text-xs text-bind/70 outline-none hover:text-ink"
            >
              <option value="line">逐行跟随</option>
              <option value="onDemand">按需翻页</option>
            </select>
          </div>
        )}

        {/* 原图对照层 */}
        {showOriginal && originalUrl && (
          <div className="max-h-[40%] shrink-0 overflow-auto border-t border-hair bg-paper-dim/70 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-bind/60">
              <span>{t("原图对照")}</span>
              {pages.length > 1 && (
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    disabled={pageIndex === 0}
                    aria-label={t("上一页")}
                    className="rounded border border-hair-strong px-1.5 py-0.5 disabled:opacity-40"
                  >
                    <IconCaretLeft size={11} />
                  </button>
                  <span>
                    {t("第 {a} / {b} 页", {
                      a: Math.min(pageIndex, pages.length - 1) + 1,
                      b: pages.length,
                    })}
                  </span>
                  <button
                    onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
                    disabled={pageIndex >= pages.length - 1}
                    aria-label={t("下一页")}
                    className="rounded border border-hair-strong px-1.5 py-0.5 disabled:opacity-40"
                  >
                    <IconCaretRight size={11} />
                  </button>
                </span>
              )}
              <span className="flex-1" />
              <button
                onClick={() => setInvertScanOverride(!invertScan)}
                aria-pressed={invertScan}
                title="反色显示扫描件（夜读时黑纸白墨）"
                className={`rounded border px-1.5 py-0.5 ${
                  invertScan
                    ? "border-ink/60 bg-ink/10 font-semibold text-ink"
                    : "border-hair-strong text-bind/60 hover:bg-paper-dim"
                }`}
              >
                反色
              </button>
            </div>
            {originalAssetPath?.toLowerCase().endsWith(".pdf") ? (
              // 固定 208px：始终小于对照区最大高（min 窗约 212px），消除 iframe 嵌套双滚条
              <iframe
                src={originalUrl}
                className={`h-52 w-full rounded border border-hair bg-paper-bright ${invertScan ? "scan-invert" : ""}`}
                title="原图"
              />
            ) : (
              <img
                src={originalUrl}
                alt="原图"
                className={`mx-auto max-w-full ${invertScan ? "scan-invert" : ""}`}
              />
            )}
          </div>
        )}
      </div>

      {isPlayable && asset.data && practice.isSuccess && (
        <PlayerBar
          api={atApi}
          scoreId={scoreId}
          playing={playing}
          currentTimeMs={position.currentTimeMs}
          endTimeMs={position.endTimeMs}
          tracks={tracks}
          initialSpeed={practice.data?.speed}
          initialVolume={practice.data?.volume}
          initialLoop={practice.data?.loopEnabled}
          initialMetronome={practice.data?.metronomeEnabled}
          initialMetronomeVolume={practice.data?.metronomeVolume}
          initialCountIn={practice.data?.countInEnabled}
          initialAB={
            practice.data?.abStart != null && practice.data?.abEnd != null
              ? { startTick: practice.data.abStart, endTick: practice.data.abEnd }
              : null
          }
          onPractice={schedulePractice}
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
            className="anim-pop-in flex h-[88%] w-[1100px] max-w-[96%] flex-col rounded-xl border border-hair bg-paper-bright p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div className="font-disp text-base font-bold text-bind">
                {t("校对编辑器 — 原图对照 · alphaTex")}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1 text-xs text-bind/60">
                  <input
                    type="checkbox"
                    checked={atxSync}
                    onChange={(e) => setAtxSync(e.target.checked)}
                    className="h-3.5 w-3.5 accent-ink"
                  />
                  {t("滚动同步")}
                </label>
                <button
                  onClick={closeAtxEditor}
                  aria-label={t("关闭校对编辑器")}
                  className="text-bind/40 transition hover:text-bind"
                >
                  <IconClose size={13} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex min-h-0 flex-1 gap-3">
              {/* 左：原图对照 */}
              <div className="flex w-1/2 min-w-0 flex-col rounded-lg border border-hair bg-paper-dim/50">
                <div className="flex items-center justify-between border-b border-hair px-2 py-1.5 text-xs text-bind/60">
                  <span title={t("点击谱面自动定位小节")}>
                    {t("原始扫描图")}
                    {atxAnalyzing ? t(" · 分析中…") : t(" · 点击可定位小节")}
                  </span>
                  <span className="flex items-center gap-2">
                    {editorPages.length > 1 && (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => setAtxPageIndex((p) => Math.max(0, p - 1))}
                          disabled={atxPageIndex === 0}
                          aria-label="上一页"
                          className="rounded border border-hair-strong px-1.5 py-0.5 disabled:opacity-40"
                        >
                          <IconCaretLeft size={11} />
                        </button>
                        第 {atxPageIndex + 1} / {editorPages.length} 页
                        <button
                          onClick={() => setAtxPageIndex((p) => Math.min(editorPages.length - 1, p + 1))}
                          disabled={atxPageIndex >= editorPages.length - 1}
                          aria-label="下一页"
                          className="rounded border border-hair-strong px-1.5 py-0.5 disabled:opacity-40"
                        >
                          <IconCaretRight size={11} />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => setInvertScanOverride(!invertScan)}
                      aria-pressed={invertScan}
                      title="反色显示扫描件（夜读时黑纸白墨）"
                      className={`rounded border px-1.5 py-0.5 ${
                        invertScan
                          ? "border-ink/60 bg-ink/10 font-semibold text-ink"
                          : "border-hair-strong text-bind/60 hover:bg-paper-dim"
                      }`}
                    >
                      反色
                    </button>
                  </span>
                </div>
                <div ref={atxImgRef} className="min-h-0 flex-1 overflow-auto p-2">
                  {atxImageUrl ? (
                    <img
                      src={atxImageUrl}
                      alt="原图"
                      className={`mx-auto w-full cursor-crosshair ${invertScan ? "scan-invert" : ""}`}
                      title="点击谱面定位小节"
                      onClick={(e) => estimateBarFromClick(e)}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-bind/55">
                      {t("无原图")}
                    </div>
                  )}
                </div>
              </div>

              {/* 右：alphaTex 编辑区 */}
              <div className="flex w-1/2 min-w-0 flex-col rounded-lg border border-hair">
                <div className="flex items-center justify-between border-b border-hair px-2 py-1.5 text-xs text-bind/60">
                  <span>
                    {t("alphaTex · 共 {n} 小节", { n: atxBarCount })}
                    {atxCaretBar > 0 && (
                      <span className="ml-2 font-semibold text-ink">
                        {t("光标在第 {n} 小节", { n: atxCaretBar })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <input
                      value={atxJumpTo}
                      onChange={(e) => setAtxJumpTo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") goToBar(Number(atxJumpTo));
                      }}
                      placeholder={t("小节")}
                      aria-label={t("跳转到小节")}
                      className="w-14 rounded border border-hair-strong bg-paper-bright px-1.5 py-0.5 text-right text-bind"
                    />
                    <button
                      onClick={() => goToBar(Number(atxJumpTo))}
                      className="rounded border border-hair-strong px-1.5 py-0.5 hover:bg-paper-dim"
                    >
                      {t("跳转")}
                    </button>
                  </span>
                </div>
                <div className="rounded-lg bg-spot-wait/10 px-3 py-1.5 text-micro text-spot-wait">
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
                  className="min-h-0 flex-1 resize-none rounded-b-lg p-3 font-mono text-xs leading-4 text-bind outline-none"
                />
              </div>
            </div>

            {atxMsg && <div className="mt-1 text-xs text-spot-ok">{atxMsg}</div>}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-spot-wait">
                {atxDirty ? t("有未保存的修改") : ""}
              </span>
              <div className="flex justify-end gap-2">
                <button
                  onClick={closeAtxEditor}
                  className="rounded-lg border border-hair-strong px-4 py-1.5 text-sm text-bind/80 hover:bg-paper-dim"
                >
                  {t("取消")}
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
                className="rounded-lg bg-ink px-4 py-1.5 text-sm font-semibold text-paper hover:bg-ink-bright"
              >
                {t("保存并刷新")}
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
            className="anim-pop-in flex h-[80%] w-[720px] max-w-[90%] flex-col rounded-xl border border-hair bg-paper-bright p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-disp text-base font-bold text-bind">{t("识别引擎日志")}</div>
              <button
                onClick={() => setShowLog(false)}
                aria-label={t("关闭日志")}
                className="text-bind/40 transition hover:text-bind"
              >
                <IconClose size={13} />
              </button>
            </div>
            {/* 引擎在说话:应用内唯一的大面积深色块,油墨绿的终端 */}
            <pre className="mt-3 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-deep p-3 text-micro text-cream/90">
              {logText}
            </pre>
          </div>
        </div>
      )}

      {/* 删除确认（window.confirm 在 wry 中不可用） */}
      <ConfirmDialog
        open={confirmingDelete}
        title={t("删除曲谱")}
        message={t("将永久删除「{t}」及其全部文件。删除后 30 秒内可在曲库撤销。", {
          t: s?.title ?? "",
        })}
        confirmLabel={t("删除")}
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
        title={t("重新识别")}
        message={t("当前谱文包含已保存的校对内容，重新识别将用新的识别结果覆盖它。原扫描图保留。")}
        confirmLabel={t("覆盖并重识")}
        onConfirm={() => {
          setConfirmingRerecognize(false);
          recognize.mutate();
        }}
        onCancel={() => setConfirmingRerecognize(false)}
      />

      {/* 编辑器脏草稿守卫 */}
      <ConfirmDialog
        open={confirmDiscardAtx}
        title={t("放弃未保存的修改？")}
        message={t("校对编辑器的修改尚未保存，关闭后将丢失。")}
        confirmLabel={t("放弃修改")}
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
  const t = useT();
  const [open, setOpen] = useState(false);
  useDismissOnEsc(open, () => setOpen(false));
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("更多操作")}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`grid h-8 w-8 place-items-center rounded-lg border ${
          open
            ? "border-ink/50 bg-ink/10 text-ink"
            : "border-hair-strong text-bind/80 hover:bg-paper-dim"
        }`}
      >
        <IconOverflow size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t("更多操作")}
            className="anim-pop-in absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-hair bg-paper-bright py-1 shadow-lg"
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-paper-dim ${
                  it.danger ? "text-spot-fail" : "text-bind/85"
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

/// 「原图」分体按钮：主键一键开/关对照层，右侧小三角展开菜单（新窗口打开等）
function OriginalMenu({
  active,
  onToggle,
  onOpenExternal,
}: {
  active: boolean;
  onToggle: () => void;
  onOpenExternal: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useDismissOnEsc(open, () => setOpen(false));
  const tone = active
    ? "border-ink/50 bg-ink/10 font-semibold text-ink"
    : "border-hair-strong text-bind/80 hover:bg-paper-dim";
  return (
    <div className="relative flex shrink-0">
      <button
        onClick={onToggle}
        title={active ? t("隐藏原图对照") : t("对照原图")}
        className={`whitespace-nowrap rounded-l-lg border border-r-0 px-2.5 py-1.5 text-sm ${tone}`}
      >
        {t("原图")}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("原图选项")}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`grid w-6 place-items-center rounded-r-lg border ${tone}`}
      >
        <IconCaretDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t("原图选项")}
            className="anim-pop-in absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-hair bg-paper-bright py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-bind/85 hover:bg-paper-dim"
            >
              {active ? t("收起对照") : t("对照原图")}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenExternal();
              }}
              title={t("用系统默认程序打开扫描件，可自由缩放、翻页、打印")}
              className="block w-full px-3 py-1.5 text-left text-sm text-bind/85 hover:bg-paper-dim"
            >
              {t("新窗口打开原图")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/// 导出下拉菜单（收拢 MIDI / 乐谱文件两个入口）
function ExportMenu({ onMidi, onSource }: { onMidi: () => void; onSource: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useDismissOnEsc(open, () => setOpen(false));
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm ${
          open
            ? "border-ink/50 bg-ink/10 font-semibold text-ink"
            : "border-hair-strong text-bind/80 hover:bg-paper-dim"
        }`}
      >
        {t("导出")} <IconCaretDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t("导出")}
            className="anim-pop-in absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-hair bg-paper-bright py-1 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onMidi();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-bind/85 hover:bg-paper-dim"
            >
              {t("导出 MIDI")}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSource();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-bind/85 hover:bg-paper-dim"
            >
              {t("导出乐谱文件")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
