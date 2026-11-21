import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlphaTabApi, model } from "@coderline/alphatab";
import { api as tauriApi, type AbSegment } from "../lib/tauri";
import {
  IconClose,
  IconList,
  IconLoop,
  IconMetronome,
  IconPause,
  IconPlay,
  IconRecord,
  IconStop,
  IconVolume,
  IconVolumeMute,
} from "./icons";
import { useUi } from "../stores/ui";
import { useT } from "../lib/i18n";

interface Props {
  api: AlphaTabApi | null;
  scoreId: string;
  playing: boolean;
  currentTimeMs: number;
  endTimeMs: number;
  tracks: { track: model.Track; name: string; muted: boolean }[];
  onToggleMute: (track: model.Track) => void;
  /// 已保存的练习状态（首次挂载时作为初始值）
  initialSpeed?: number;
  initialVolume?: number;
  initialLoop?: boolean;
  initialAB?: { startTick: number; endTick: number } | null;
  initialMetronome?: boolean;
  /// alphaTab 量程 0.0-3.0
  initialMetronomeVolume?: number;
  initialCountIn?: boolean;
  /// 练习状态变化上报（父级防抖落库）
  onPractice?: (p: {
    speed?: number;
    volume?: number;
    loopEnabled?: boolean;
    ab?: { startTick: number; endTick: number } | null;
    metronomeEnabled?: boolean;
    metronomeVolume?: number;
    countInEnabled?: boolean;
  }) => void;
}

function fmtTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSpeed(v: number) {
  return `${Number.isInteger(v) ? v : v.toFixed(2)}x`;
}

export default function PlayerBar({
  api,
  scoreId,
  playing,
  currentTimeMs,
  endTimeMs,
  tracks,
  onToggleMute,
  initialSpeed,
  initialVolume,
  initialLoop,
  initialAB,
  initialMetronome,
  initialMetronomeVolume,
  initialCountIn,
  onPractice,
}: Props) {
  const [speed, setSpeed] = useState(initialSpeed ?? 1);
  const [loop, setLoop] = useState(initialLoop ?? false);
  const [loopA, setLoopA] = useState<number | null>(initialAB?.startTick ?? null);
  const [loopB, setLoopB] = useState<number | null>(initialAB?.endTick ?? null);
  const [metronome, setMetronome] = useState(initialMetronome ?? false);
  // 滑杆 0-100 映射 alphaTab 官方量程 0.0-3.0(channelSetMixVolume 无上限钳制)
  const METRO_MAX = 3;
  const [metroVol, setMetroVol] = useState(() => {
    if (initialMetronomeVolume != null && initialMetronomeVolume > 0) {
      return Math.min(100, Math.round((initialMetronomeVolume / METRO_MAX) * 100));
    }
    return 50; // 默认 50% → 1.5
  });
  const lastMetroVolRef = useRef(metroVol > 0 ? metroVol : 50);
  const [countIn, setCountIn] = useState(initialCountIn ?? false);
  const [volume, setVolume] = useState(initialVolume ?? 100);
  const lastVolumeRef = useRef(initialVolume ?? 100);
  // 移调:仅影响播放声音(谱面不变);打击乐通道(GM ch9)不动,否则鼓组跑调
  const [transpose, setTranspose] = useState(0);
  // 录音自听:麦克风跟录(点 REC 开始,再点停止并保存),悬浮面板回放/删除
  const [recording, setRecording] = useState(false);
  const [playingRec, setPlayingRec] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordings = useQuery({
    queryKey: ["recordings", scoreId],
    queryFn: () => tauriApi.listRecordings(scoreId),
  });
  const showToast = useUi((s) => s.showToast);
  const t = useT();

  // 循环段落库:命名保存当前 A-B,一键切换
  const queryClient = useQueryClient();
  const [segName, setSegName] = useState("");
  const segments = useQuery({
    queryKey: ["abSegments", scoreId],
    queryFn: () => tauriApi.list_ab_segments(scoreId),
  });
  const barOfTick = (t: number) => {
    let n = 1;
    for (const b of bars) {
      if (b.start <= t) n += 1;
      else break;
    }
    return Math.max(1, n - 1);
  };
  const segmentLabel = (seg: AbSegment) => {
    if (bars.length === 0) return "";
    return `${barOfTick(Math.min(seg.startTick, seg.endTick))}–${barOfTick(
      Math.max(seg.startTick, seg.endTick),
    )} 小节`;
  };
  const applySegment = (seg: AbSegment) => {
    const lo = Math.min(seg.startTick, seg.endTick);
    const hi = Math.max(seg.startTick, seg.endTick);
    const player = api?.player;
    if (!player) return;
    setLoopA(lo);
    setLoopB(hi);
    player.playbackRange = { startTick: lo, endTick: hi };
    player.isLooping = true;
    setLoop(true);
    onPractice?.({ ab: { startTick: lo, endTick: hi }, loopEnabled: true });
  };
  const saveSegment = async () => {
    if (!abActive || loopA == null || loopB == null) return;
    const name = segName.trim() || `段落 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    await tauriApi.save_ab_segment(
      scoreId,
      name,
      Math.min(loopA, loopB),
      Math.max(loopA, loopB),
    );
    setSegName("");
    queryClient.invalidateQueries({ queryKey: ["abSegments", scoreId] });
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop(); // onstop 里收尾(存盘/清流)
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/mp4" });
        const ext = (rec.mimeType || "audio/mp4").includes("webm") ? "webm" : "m4a";
        blob
          .arrayBuffer()
          .then((buf) => tauriApi.saveRecording(scoreId, new Uint8Array(buf), ext))
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["recordings", scoreId] });
            showToast({ message: "录音已保存" });
          })
          .catch((err) => showToast({ message: `录音保存失败:${String(err)}` }, 6000));
        setRecording(false);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      showToast({ message: `无法开始录音:${msg}` }, 6000);
    }
  };
  const playRecording = async (path: string) => {
    if (playingRec === path) {
      recAudioRef.current?.pause();
      setPlayingRec(null);
      return;
    }
    try {
      const bytes = await tauriApi.readScoreAsset(path);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
      if (recAudioRef.current) {
        recAudioRef.current.src = url;
        recAudioRef.current.play();
        setPlayingRec(path);
      }
    } catch (e) {
      showToast({ message: `回放失败:${String(e)}` }, 6000);
    }
  };
  // 卸载时停录音/收流
  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // 恢复已保存的 A-B 区间（api 就绪后一次性应用）
  const abAppliedRef = useRef(false);
  useEffect(() => {
    if (abAppliedRef.current || !api?.player) return;
    const ab = initialAB;
    if (ab) {
      abAppliedRef.current = true;
      api.player.playbackRange = { startTick: ab.startTick, endTick: ab.endTick };
      api.player.isLooping = initialLoop ?? false;
    }
  }, [api, initialAB, initialLoop]);

  // 恢复节拍器/预备拍（api 就绪后一次性应用；后续变化由各控件直接写 player 并上报落库）
  const metroAppliedRef = useRef(false);
  useEffect(() => {
    if (metroAppliedRef.current || !api?.player) return;
    metroAppliedRef.current = true;
    const vol = (metroVol / 100) * METRO_MAX;
    api.player.metronomeVolume = metronome ? vol : 0;
    // 预备拍音量独立于节拍器开关：关掉节拍器也能只要预备拍
    api.player.countInVolume = countIn ? vol : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // 练习快捷键 M/L:经 ref 取最新处理函数(播放条随播放进度高频重渲染,监听只注册一次)。
  // hooks 必须在 `if (!api) return null` 之前——否则 api 未就绪的首渲染 hook 数量不一致,整树白屏。
  const metroToggleRef = useRef<() => void>(() => {});
  const loopToggleRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k !== "m" && k !== "l") return;
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
      e.preventDefault();
      if (k === "m") metroToggleRef.current();
      else loopToggleRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 移调跟随轨道变化重放(重载谱后通道重建,要重新套用当前移调);
  // effect 同样必须在 `if (!api) return null` 之前,hook 顺序才稳定。
  useEffect(() => {
    if (transpose !== 0) applyTranspose(transpose, tracks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  if (!api || !api.player) return null;
  const pct = endTimeMs > 0 ? Math.min(100, (currentTimeMs / endTimeMs) * 100) : 0;
  const abActive = loopA !== null && loopB !== null;
  // 小节刻度:masterBar 起点 → 校准轨同空间的细刻度(每 5 根加高;过密时抽稀)
  const bars = api.score?.masterBars ?? [];
  const endTick = api.endTick;
  const tickEvery = bars.length > 44 ? Math.ceil(bars.length / 44) : 1;
  // A-B 区间映射到进度条百分比
  const tickToPct = (t: number | null) =>
    t !== null && api.endTick > 0 ? (t / api.endTick) * 100 : null;
  const aPct = tickToPct(loopA);
  const bPct = tickToPct(loopB);

  const markLoop = (which: "a" | "b") => {
    const tick = api.player!.tickPosition;
    const a = which === "a" ? tick : loopA;
    const b = which === "b" ? tick : loopB;
    if (which === "a") setLoopA(tick);
    else setLoopB(tick);
    if (a !== null && b !== null) {
      api.player!.playbackRange = { startTick: Math.min(a, b), endTick: Math.max(a, b) };
      api.player!.isLooping = true;
      setLoop(true);
      onPractice?.({ ab: { startTick: Math.min(a, b), endTick: Math.max(a, b) }, loopEnabled: true });
    }
  };

  const clearAB = () => {
    setLoopA(null);
    setLoopB(null);
    api.player!.playbackRange = null;
    api.player!.isLooping = false;
    setLoop(false);
    onPractice?.({ ab: null, loopEnabled: false });
  };

  const seekMs = (ms: number) => {
    if (!api?.player) return;
    const end = endTimeMs > 0 ? endTimeMs : 1;
    const next = Math.min(end, Math.max(0, ms));
    api.player.tickPosition = Math.round((next / end) * api.endTick);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekMs(ratio * endTimeMs);
  };

  const toggleCls = (on: boolean) =>
    on
      ? "border-ink/60 bg-ink/10 text-ink"
      : "border-hair-strong text-bind/60 hover:bg-paper-dim";

  // 移调应用到全部非打击乐通道(主/次通道都算);tracks 变化(重载谱)后要重放当前移调
  const PERCUSSION_CHANNEL = 9;
  const applyTranspose = (semitones: number, trackList: Props["tracks"]) => {
    if (!api?.player) return;
    const map = new Map<number, number>();
    for (const { track } of trackList) {
      const info = track.playbackInfo;
      for (const ch of [info.primaryChannel, info.secondaryChannel]) {
        if (ch != null && ch !== PERCUSSION_CHANNEL) map.set(ch, semitones);
      }
    }
    api.player.applyTranspositionPitches(map);
  };
  const toggleMetronome = () => {
    const next = !metronome;
    setMetronome(next);
    // 开 = 恢复上次用过的音量,关 = 静音
    const vol = (lastMetroVolRef.current / 100) * METRO_MAX;
    api.player!.metronomeVolume = next ? vol : 0;
    onPractice?.({ metronomeEnabled: next, metronomeVolume: vol });
  };
  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    api.player!.isLooping = next;
    onPractice?.({ loopEnabled: next });
  };
  metroToggleRef.current = toggleMetronome;
  loopToggleRef.current = toggleLoop;

  return (
    <div className="flex items-center gap-2 border-t border-hair bg-paper-bright px-4 py-2">
      <button
        onClick={() => (playing ? api.pause() : api.play())}
        className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper hover:bg-ink-bright"
        title={playing ? t("暂停") : t("播放")}
        aria-label={playing ? t("暂停") : t("播放")}
      >
        {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
      </button>
      <button
        onClick={() => api.stop()}
        className="grid h-8 w-8 place-items-center rounded-full border border-hair-strong text-bind/60 hover:bg-paper-dim"
        title={t("停止")}
        aria-label={t("停止")}
      >
        <IconStop size={12} />
      </button>
      {/* 循环簇：⟳ 与 A-B 段同一分组（内距 4px），由右侧发丝线与进度区分隔 */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleLoop}
          className={`grid h-8 w-8 place-items-center rounded-full border text-xs ${toggleCls(loop)}`}
          title={t("循环播放")}
          aria-label={t("循环播放")}
          aria-pressed={loop}
        >
          <IconLoop size={13} />
        </button>
        <div
          className="flex items-center gap-0.5"
          title={t("A-B 循环：播放到目标位置时依次按下 A、B")}
        >
        <button
          onClick={() => markLoop("a")}
          className={`h-8 w-7 rounded-l-md border text-xs ${toggleCls(loopA !== null)}`}
          aria-label={t("标记 A 点")}
        >
          A
        </button>
        <button
          onClick={() => markLoop("b")}
          className={`h-8 w-7 rounded-r-md border text-xs ${toggleCls(loopB !== null)}`}
          aria-label={t("标记 B 点")}
        >
          B
        </button>
        {abActive && (
          <button
            onClick={clearAB}
            className="ml-0.5 h-8 w-6 rounded-md border border-hair-strong text-xs text-bind/40 hover:border-spot-fail/40 hover:bg-spot-fail/10 hover:text-spot-fail"
            title={t("清除 A-B 循环")}
            aria-label={t("清除 A-B 循环")}
          >
            <IconClose size={11} />
          </button>
        )}
        {/* 段落库:命名保存当前 A-B,一键切换 */}
        <div className="group/seg relative flex items-center">
          <button
            className="grid h-8 w-8 place-items-center rounded-full border border-hair-strong text-bind/60 hover:bg-paper-dim"
            title={t("循环段落")}
            aria-label={t("循环段落")}
          >
            <IconList size={13} />
          </button>
          <div className="pointer-events-none absolute bottom-full left-0 z-20 pb-1.5 opacity-0 transition-opacity duration-150 group-focus-within/seg:pointer-events-auto group-focus-within/seg:opacity-100 group-hover/seg:pointer-events-auto group-hover/seg:opacity-100">
            <div className="w-64 rounded-lg border border-hair bg-paper-bright p-3 shadow-lg">
              {abActive ? (
                <div className="flex gap-2">
                  <input
                    value={segName}
                    onChange={(e) => setSegName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSegment();
                    }}
                    placeholder={t("给这段起个名…")}
                    aria-label={t("给这段起个名…")}
                    className="min-w-0 flex-1 rounded-md border border-hair-strong bg-paper-bright px-2 py-1 text-xs text-bind outline-none placeholder:text-bind/40 focus:border-ink"
                  />
                  <button
                    onClick={() => saveSegment()}
                    className="shrink-0 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-paper hover:bg-ink-bright"
                  >
                    {t("保存")}
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-bind/55">
                  {t("框好 A-B 后,在这里命名保存成循环段落。")}
                </div>
              )}
              <ul className="mt-2 max-h-44 overflow-y-auto">
                {(segments.data ?? []).map((seg) => (
                  <li key={seg.id} className="group/row flex items-center gap-1">
                    <button
                      onClick={() => applySegment(seg)}
                      className="flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper-dim"
                    >
                      <span className="truncate text-xs font-semibold text-bind">{seg.name}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-bind/50">
                        {segmentLabel(seg)}
                      </span>
                    </button>
                    <button
                      onClick={async () => {
                        await tauriApi.delete_ab_segment(seg.id);
                        queryClient.invalidateQueries({ queryKey: ["abSegments", scoreId] });
                      }}
                      aria-label={t("删除段落 {t}", { t: seg.name })}
                      className="shrink-0 p-1 text-bind/30 opacity-0 transition group-hover/row:opacity-100 hover:text-spot-fail"
                      title={t("删除段落")}
                    >
                      <IconClose size={10} />
                    </button>
                  </li>
                ))}
                {segments.data && segments.data.length === 0 && (
                  <li className="px-2 py-1 text-[11px] text-bind/45">{t("还没有保存的段落。")}</li>
                )}
              </ul>
            </div>
          </div>
        </div>
        </div>
      </div>

      <span className="mx-1 h-6 w-px shrink-0 bg-hair" aria-hidden="true" />

      {/* 校准轨:全应用唯一时间轴——播放进度、A-B 金标区间、时间刻度全部注册其上 */}
      <div className="min-w-[160px] flex-1">
        <div className="relative pt-2">
          {/* A-B 排练记号式金标:悬在轨上方的金色括弧 + A/B 端点刻度 */}
          {abActive && aPct !== null && bPct !== null && (
            <div
              className="absolute top-0 h-[5px] rounded-sm bg-gold"
              style={{ left: `${Math.min(aPct, bPct)}%`, width: `${Math.abs(bPct - aPct)}%` }}
              aria-hidden="true"
            >
              <span
                className="absolute -left-px top-0 h-[9px] w-px bg-gold"
                style={{ top: -2 }}
              />
              <span
                className="absolute -right-px top-0 h-[9px] w-px bg-gold"
                style={{ top: -2 }}
              />
            </div>
          )}
          <div
            className="relative h-2 cursor-pointer rounded-full bg-bind/15"
            onClick={seek}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                seekMs(currentTimeMs - 5000);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                seekMs(currentTimeMs + 5000);
              }
            }}
            tabIndex={0}
            role="slider"
            aria-label={t("播放进度")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-valuetext={`${fmtTime(currentTimeMs)} / ${fmtTime(endTimeMs)}`}
          >
            <div
              className="absolute left-0 top-0 h-2 rounded-full bg-ink"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* 小节刻度:与进度、A-B 同一条校准轨(轨下标尺行) */}
          {bars.length > 1 && endTick > 0 && (
            <div className="relative mt-0.5 h-[5px]" aria-hidden="true">
              {bars.map((b, i) =>
                i % tickEvery === 0 ? (
                  <span
                    key={i}
                    className={`absolute w-px bg-bind/30 ${
                      i % (tickEvery * 5) === 0 ? "top-0 h-[5px]" : "top-[2px] h-[3px]"
                    }`}
                    style={{ left: `${Math.min(100, (b.start / endTick) * 100)}%` }}
                  />
                ) : null,
              )}
            </div>
          )}
        </div>
        <div className="mt-0.5 text-center text-micro text-bind/60">
          {fmtTime(currentTimeMs)} / {fmtTime(endTimeMs)}
        </div>
      </div>

      <span className="mx-1 h-6 w-px shrink-0 bg-hair" aria-hidden="true" />

      {/* 声音与轨道簇（内距 8px） */}
      <div className="flex items-center gap-2">
        {/* 节拍器:hover 弹出上方音量面板;滑杆拖到 0 即关闭,拉起即开启 */}
        <div className="group/metro relative flex items-center">
        <button
          onClick={toggleMetronome}
          className={`relative grid h-8 w-8 place-items-center rounded-full border ${
              metronome
                ? "border-spot-wait bg-spot-wait/10 text-spot-wait"
                : "border-hair-strong text-bind/60 hover:bg-paper-dim"
            }`}
            title={t("节拍器")}
            aria-label={t("节拍器")}
            aria-pressed={metronome}
          >
            {/* 琥珀专色的「节拍灯」:激活时节拍脉动(prefers-reduced-motion 下静止) */}
            {metronome && (
              <span
                className="anim-beat pointer-events-none absolute inset-0 rounded-full border-2 border-spot-wait"
                aria-hidden="true"
              />
            )}
            <IconMetronome active={metronome} />
          </button>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 -translate-x-1/2 pb-1.5 opacity-0 transition-opacity duration-150 group-focus-within/metro:pointer-events-auto group-focus-within/metro:opacity-100 group-hover/metro:pointer-events-auto group-hover/metro:opacity-100">
            <div className="rounded-lg border border-hair bg-paper-bright px-3 py-2 shadow-lg">
              <label
                className="flex items-center gap-2 whitespace-nowrap text-xs text-bind/60"
                title={t("节拍器音量")}
              >
                {t("节拍音量")}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={metroVol}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMetroVol(v);
                    if (v > 0) lastMetroVolRef.current = v;
                    api.player!.metronomeVolume = (v / 100) * METRO_MAX;
                    setMetronome(v > 0);
                    onPractice?.({
                      metronomeEnabled: v > 0,
                      metronomeVolume: (v / 100) * METRO_MAX,
                    });
                  }}
                  className="w-28 accent-ink"
                  aria-label={t("节拍器音量")}
                />
              </label>
              <label
                className="mt-2 flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-bind/60"
                title={t("开始播放前先给一小节预备拍")}
              >
                <input
                  type="checkbox"
                  checked={countIn}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setCountIn(next);
                    // 预备拍音量跟随节拍音量,独立开关
                    api.player!.countInVolume = next
                      ? (lastMetroVolRef.current / 100) * METRO_MAX
                      : 0;
                    onPractice?.({ countInEnabled: next });
                  }}
                  className="h-3.5 w-3.5 accent-ink"
                />
                {t("预备拍")}
              </label>
            </div>
          </div>
        </div>

      {/* 录音自听:REC 开始跟录(红色脉动),再点停止并保存;悬浮面板回放/删除 */}
      <div className="group/rec relative flex items-center">
        <button
          onClick={toggleRecording}
          className={`relative grid h-8 w-8 place-items-center rounded-full border ${
            recording
              ? "border-spot-fail bg-spot-fail/10 text-spot-fail"
              : "border-hair-strong text-bind/60 hover:bg-paper-dim"
          }`}
          title={recording ? t("停止录音") : t("录音(跟着谱子演奏,录下来回放对比)")}
          aria-label={recording ? t("停止录音") : t("开始录音")}
        >
          {recording && (
            <span
              className="anim-beat pointer-events-none absolute inset-0 rounded-full border-2 border-spot-fail"
              aria-hidden="true"
            />
          )}
          <IconRecord size={11} />
        </button>
        <div className="pointer-events-none absolute bottom-full left-0 z-20 pb-1.5 opacity-0 transition-opacity duration-150 group-focus-within/rec:pointer-events-auto group-focus-within/rec:opacity-100 group-hover/rec:pointer-events-auto group-hover/rec:opacity-100">
          <div className="w-60 rounded-lg border border-hair bg-paper-bright p-2 shadow-lg">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-widest text-bind/45">
              {t("我的录音")}
            </div>
            <ul className="max-h-44 overflow-y-auto">
              {(recordings.data ?? []).map((r: string) => (
                <li key={r} className="group/row flex items-center gap-1">
                  <button
                    onClick={() => playRecording(r)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper-dim"
                    title={playingRec === r ? t("停止回放") : t("回放")}
                  >
                    <span className="shrink-0 text-ink">
                      {playingRec === r ? <IconStop size={10} /> : <IconPlay size={10} />}
                    </span>
                    <span className="truncate text-xs text-bind">
                      {r.split("/").pop()?.replace(/^(rec-)|\.(m4a|webm|ogg|mp3|wav)$/g, "")}
                    </span>
                  </button>
                  <button
                    onClick={async () => {
                      await tauriApi.deleteRecording(r);
                      queryClient.invalidateQueries({ queryKey: ["recordings", scoreId] });
                    }}
                    aria-label={t("删除录音")}
                    className="shrink-0 p-1 text-bind/30 opacity-0 transition group-hover/row:opacity-100 hover:text-spot-fail"
                    title={t("删除录音")}
                  >
                    <IconClose size={10} />
                  </button>
                </li>
              ))}
              {recordings.data && recordings.data.length === 0 && (
                <li className="px-1 py-1 text-[11px] text-bind/45">
                  {t("还没有录音——按下 REC 跟着谱子演奏试试。")}
                </li>
              )}
            </ul>
          </div>
        </div>
        <audio ref={recAudioRef} className="hidden" onEnded={() => setPlayingRec(null)} />
      </div>

      {/* 主音量:hover 弹出上方面板;点击按钮 = 静音切换,滑杆拖到 0 同效。
          排在速度左边,给上方悬浮面板留出右缘展开空间(否则会顶出窗口出现滚动条) */}
      <div className="group/vol relative flex items-center">
        <button
          onClick={() => {
            const next = volume > 0 ? lastVolumeRef.current || 100 : 0;
            setVolume(next);
            if (next > 0) lastVolumeRef.current = next;
            api.player!.masterVolume = next / 100;
            onPractice?.({ volume: next / 100 });
          }}
          className="grid h-8 w-8 place-items-center rounded-full border border-hair-strong text-bind/60 hover:bg-paper-dim"
          title={t("音量")}
          aria-label={t("音量")}
        >
          <IconVolumeMute size={14} className={volume > 0 ? "hidden" : undefined} />
          <IconVolume size={14} className={volume > 0 ? undefined : "hidden"} />
        </button>
        <div className="pointer-events-none absolute bottom-full right-0 z-20 pb-1.5 opacity-0 transition-opacity duration-150 group-focus-within/vol:pointer-events-auto group-focus-within/vol:opacity-100 group-hover/vol:pointer-events-auto group-hover/vol:opacity-100">
          <div className="rounded-lg border border-hair bg-paper-bright px-3 py-2 shadow-lg">
            <label
              className="flex items-center gap-2 whitespace-nowrap text-xs text-bind/60"
              title={t("主音量")}
            >
              {t("音量")}
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (v > 0) lastVolumeRef.current = v;
                  api.player!.masterVolume = v / 100;
                  onPractice?.({ volume: v / 100 });
                }}
                className="w-28 accent-ink"
                aria-label="音量"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 移调:hover 弹出上方面板;仅影响播放声音,谱面不变,打击乐不动 */}
      <div className="group/tp relative flex items-center">
        <button
          onClick={() => {
            setTranspose(0);
            applyTranspose(0, tracks);
          }}
          className={`grid h-8 w-8 place-items-center rounded-full border text-[10px] font-semibold tabular-nums ${
            transpose !== 0
              ? "border-ink/50 bg-ink/10 text-ink"
              : "border-hair-strong text-bind/60 hover:bg-paper-dim"
          }`}
          title={t("移调（点击归零）")}
          aria-label={t("移调")}
        >
          {transpose > 0 ? `+${transpose}` : transpose}
        </button>
        <div className="pointer-events-none absolute bottom-full right-0 z-20 pb-1.5 opacity-0 transition-opacity duration-150 group-focus-within/tp:pointer-events-auto group-focus-within/tp:opacity-100 group-hover/tp:pointer-events-auto group-hover/tp:opacity-100">
          <div className="rounded-lg border border-hair bg-paper-bright px-3 py-2 shadow-lg">
            <label
              className="flex items-center gap-2 whitespace-nowrap text-xs text-bind/60"
              title={t("移调(半音)")}
            >
              {t("移调")}
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={transpose}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTranspose(v);
                  applyTranspose(v, tracks);
                }}
                className="w-28 accent-ink"
                aria-label={t("移调(半音)")}
              />
              <span className="w-8 text-right font-semibold tabular-nums text-bind">
                {transpose > 0 ? `+${transpose}` : transpose}
              </span>
            </label>
            <div className="mt-1.5 text-[11px] text-bind/55">
              {t("只影响播放声音，谱面不变；打击乐不动")}
            </div>
          </div>
        </div>
      </div>

      {/* 播放速度:hover 弹出上方面板,连续调节 + 预设档;点击按钮回到 1x */}
      <div className="group/speed relative flex items-center">
        <button
          onClick={() => {
            setSpeed(1);
            api.player!.playbackSpeed = 1;
            onPractice?.({ speed: 1 });
          }}
          className="grid h-8 w-8 place-items-center rounded-full border border-hair-strong text-[10px] font-semibold tabular-nums text-bind/60 hover:bg-paper-dim"
          title={t("播放速度（点击回到 1x）")}
          aria-label={t("播放速度")}
        >
          {Number.isInteger(speed) ? speed : speed.toFixed(2)}
        </button>
        <div className="pointer-events-none absolute bottom-full right-0 z-20 pb-1.5 opacity-0 transition-opacity duration-150 group-focus-within/speed:pointer-events-auto group-focus-within/speed:opacity-100 group-hover/speed:pointer-events-auto group-hover/speed:opacity-100">
          <div className="rounded-lg border border-hair bg-paper-bright px-3 py-2 shadow-lg">
            <label
              className="flex items-center gap-2 whitespace-nowrap text-xs text-bind/60"
              title={t("播放速度")}
            >
              {t("速度")}
              <input
                type="range"
                min={0.25}
                max={3}
                step={0.05}
                value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeed(v);
                  api.player!.playbackSpeed = v;
                  onPractice?.({ speed: v });
                }}
                className="w-28 accent-ink"
                aria-label={t("播放速度")}
              />
              <span className="w-10 text-right font-semibold tabular-nums text-bind">
                {fmtSpeed(speed)}
              </span>
            </label>
            <div className="mt-2 flex gap-1">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setSpeed(v);
                    api.player!.playbackSpeed = v;
                    onPractice?.({ speed: v });
                  }}
                  className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                    Math.abs(speed - v) < 0.001
                      ? "border-ink/50 bg-ink/10 text-ink"
                      : "border-hair text-bind/60 hover:bg-paper-dim"
                  }`}
                >
                  {fmtSpeed(v)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

        {/* 轨道 chip 的唯一用途是分轨静音；单轨时"静音唯一音轨"等于静音全曲，没有意义 */}
        {tracks.length > 1 && (
          <div className="flex max-w-[260px] flex-wrap items-center justify-end gap-1 overflow-y-auto" style={{ maxHeight: 58 }}>
            {tracks.map(({ track, name, muted }) => (
              <button
                key={String(track.index)}
                onClick={() => onToggleMute(track)}
                aria-label={muted
                  ? t("取消静音轨道 {t}", { t: name || `${track.index + 1}` })
                  : t("静音轨道 {t}", { t: name || `${track.index + 1 }` })}
                aria-pressed={muted}
                className={`max-w-28 shrink-0 truncate rounded-md border px-2 py-1 text-xs ${
                  muted
                    ? "border-hair text-bind/40 line-through hover:bg-paper-dim"
                    : "border-ink/50 bg-ink/10 text-ink"
                }`}
                title={name}
              >
                {name || `${t("轨道")} ${track.index + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
