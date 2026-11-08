import { useEffect, useRef, useState } from "react";
import { AlphaTabApi, model } from "@coderline/alphatab";

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

  return (
    <div className="flex items-center gap-2 border-t border-zinc-200 bg-white px-4 py-2">
      <button
        onClick={() => (playing ? api.pause() : api.play())}
        className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500"
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <button
        onClick={() => api.stop()}
        className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
        title="停止"
        aria-label="停止"
      >
        ■
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
          className={`grid h-8 w-8 place-items-center rounded-full border text-xs ${
            loop
              ? "border-indigo-300 bg-indigo-50 text-indigo-600"
              : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
          title="循环播放"
          aria-label="循环播放"
          aria-pressed={loop}
        >
          ⟳
        </button>
        <div className="flex items-center gap-0.5" title="A-B 循环：播放到目标位置时依次按下 A、B">
        <button
          onClick={() => markLoop("a")}
          className={`h-8 w-7 rounded-l-md border text-xs ${
            loopA !== null
              ? "border-indigo-300 bg-indigo-50 text-indigo-600"
              : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
          aria-label="标记 A 点"
        >
          A
        </button>
        <button
          onClick={() => markLoop("b")}
          className={`h-8 w-7 rounded-r-md border text-xs ${
            loopB !== null
              ? "border-indigo-300 bg-indigo-50 text-indigo-600"
              : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
          aria-label="标记 B 点"
        >
          B
        </button>
        {abActive && (
          <button
            onClick={clearAB}
            className="ml-0.5 h-8 w-6 rounded-md border border-zinc-200 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-600"
            title="清除 A-B 循环"
            aria-label="清除 A-B 循环"
          >
            ✕
          </button>
        )}
        </div>
      </div>

      <span className="mx-1 h-6 w-px shrink-0 bg-zinc-200" aria-hidden="true" />

      <div className="min-w-[160px] flex-1">
        <div
          className="relative h-2 cursor-pointer rounded-full bg-zinc-200"
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
          {/* A-B 循环区间：未播放段显示浅靛底，与播放填充叠加后整个区间始终可辨 */}
          {abActive && aPct !== null && bPct !== null && (
            <div
              className="absolute top-0 h-2 rounded-full bg-indigo-400"
              style={{ left: `${Math.min(aPct, bPct)}%`, width: `${Math.abs(bPct - aPct)}%` }}
              aria-hidden="true"
            />
          )}
          <div
            className="absolute left-0 top-0 h-2 rounded-full bg-indigo-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-0.5 text-center text-micro text-zinc-500">
          {fmtTime(currentTimeMs)} / {fmtTime(endTimeMs)}
        </div>
      </div>

      <span className="mx-1 h-6 w-px shrink-0 bg-zinc-200" aria-hidden="true" />

      {/* 声音与轨道簇（内距 8px） */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const next = !metronome;
            setMetronome(next);
            api.player!.metronomeVolume = next ? 0.8 : 0;
          }}
          className={`relative grid h-8 w-8 place-items-center rounded-full border text-sm ${
            metronome
              ? "border-amber-300 bg-amber-50 text-amber-600"
              : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
          title="节拍器"
          aria-label="节拍器"
          aria-pressed={metronome}
        >
          {/* 北极星的「灯」：激活时节拍脉动（prefers-reduced-motion 下静止） */}
          {metronome && (
            <span
              className="anim-beat pointer-events-none absolute inset-0 rounded-full border-2 border-amber-400"
              aria-hidden="true"
            />
          )}
          🥁
        </button>

      <label className="flex items-center gap-1 text-xs text-zinc-500">
        速度
          <select
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              api.player!.playbackSpeed = v;
              onPractice?.({ speed: v });
            }}
            className="rounded-lg border border-zinc-200 px-1 py-0.5"
            aria-label="播放速度"
          >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
            <option key={v} value={v}>
              {v}x
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-xs text-zinc-500">
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
          className="w-20"
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
                    ? "border-zinc-200 text-zinc-400 line-through"
                    : "border-indigo-200 bg-indigo-50 text-indigo-700"
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
