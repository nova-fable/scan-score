import { useEffect, useRef, useState } from "react";
import { AlphaTabApi, model } from "@coderline/alphatab";
import {
  IconClose,
  IconLoop,
  IconMetronome,
  IconPause,
  IconPlay,
  IconStop,
} from "./icons";

interface Props {
  api: AlphaTabApi | null;
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
  /// 练习状态变化上报（父级防抖落库）
  onPractice?: (p: {
    speed?: number;
    volume?: number;
    loopEnabled?: boolean;
    ab?: { startTick: number; endTick: number } | null;
  }) => void;
}

function fmtTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayerBar({
  api,
  playing,
  currentTimeMs,
  endTimeMs,
  tracks,
  onToggleMute,
  initialSpeed,
  initialVolume,
  initialLoop,
  initialAB,
  onPractice,
}: Props) {
  const [speed, setSpeed] = useState(initialSpeed ?? 1);
  const [loop, setLoop] = useState(initialLoop ?? false);
  const [loopA, setLoopA] = useState<number | null>(initialAB?.startTick ?? null);
  const [loopB, setLoopB] = useState<number | null>(initialAB?.endTick ?? null);
  const [metronome, setMetronome] = useState(false);
  const [volume, setVolume] = useState(initialVolume ?? 100);

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
    onPractice?.({ ab: null });
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

  return (
    <div className="flex items-center gap-2 border-t border-hair bg-paper-bright px-4 py-2">
      <button
        onClick={() => (playing ? api.pause() : api.play())}
        className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper hover:bg-ink-bright"
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
      >
        {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
      </button>
      <button
        onClick={() => api.stop()}
        className="grid h-8 w-8 place-items-center rounded-full border border-hair-strong text-bind/60 hover:bg-paper-dim"
        title="停止"
        aria-label="停止"
      >
        <IconStop size={12} />
      </button>
      {/* 循环簇：⟳ 与 A-B 段同一分组（内距 4px），由右侧发丝线与进度区分隔 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            const next = !loop;
            setLoop(next);
            api.player!.isLooping = next;
            onPractice?.({ loopEnabled: next });
          }}
          className={`grid h-8 w-8 place-items-center rounded-full border text-xs ${toggleCls(loop)}`}
          title="循环播放"
          aria-label="循环播放"
          aria-pressed={loop}
        >
          <IconLoop size={13} />
        </button>
        <div className="flex items-center gap-0.5" title="A-B 循环：播放到目标位置时依次按下 A、B">
        <button
          onClick={() => markLoop("a")}
          className={`h-8 w-7 rounded-l-md border text-xs ${toggleCls(loopA !== null)}`}
          aria-label="标记 A 点"
        >
          A
        </button>
        <button
          onClick={() => markLoop("b")}
          className={`h-8 w-7 rounded-r-md border text-xs ${toggleCls(loopB !== null)}`}
          aria-label="标记 B 点"
        >
          B
        </button>
        {abActive && (
          <button
            onClick={clearAB}
            className="ml-0.5 h-8 w-6 rounded-md border border-hair-strong text-xs text-bind/40 hover:border-spot-fail/40 hover:bg-spot-fail/10 hover:text-spot-fail"
            title="清除 A-B 循环"
            aria-label="清除 A-B 循环"
          >
            <IconClose size={11} />
          </button>
        )}
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
            className="relative h-2 cursor-pointer rounded-full [background-color:rgba(28,36,32,0.14)]"
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
            aria-label="播放进度"
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
        <button
          onClick={() => {
            const next = !metronome;
            setMetronome(next);
            api.player!.metronomeVolume = next ? 0.8 : 0;
          }}
          className={`relative grid h-8 w-8 place-items-center rounded-full border ${
            metronome
              ? "border-spot-wait bg-spot-wait/10 text-spot-wait"
              : "border-hair-strong text-bind/60 hover:bg-paper-dim"
          }`}
          title="节拍器"
          aria-label="节拍器"
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

      <label className="flex items-center gap-1 text-xs text-bind/60">
        速度
          <select
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              api.player!.playbackSpeed = v;
              onPractice?.({ speed: v });
            }}
            className="rounded-lg border border-hair-strong bg-paper-bright px-1 py-0.5 text-bind"
            aria-label="播放速度"
          >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
            <option key={v} value={v}>
              {v}x
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-xs text-bind/60">
        音量
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            api.player!.masterVolume = v / 100;
            onPractice?.({ volume: v / 100 });
          }}
          className="w-20 accent-[#1e4636]"
          aria-label="音量"
        />
      </label>

        {tracks.length > 0 && (
          <div className="flex max-w-[260px] flex-wrap items-center justify-end gap-1 overflow-y-auto" style={{ maxHeight: 58 }}>
            {tracks.map(({ track, name, muted }) => (
              <button
                key={String(track.index)}
                onClick={() => onToggleMute(track)}
                aria-label={muted ? `取消静音轨道 ${name || track.index + 1}` : `静音轨道 ${name || track.index + 1}`}
                aria-pressed={muted}
                className={`max-w-28 shrink-0 truncate rounded-md border px-2 py-1 text-xs ${
                  muted
                    ? "border-hair text-bind/40 line-through hover:bg-paper-dim"
                    : "border-ink/50 bg-ink/10 text-ink"
                }`}
                title={name}
              >
                {name || `轨道 ${track.index + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
