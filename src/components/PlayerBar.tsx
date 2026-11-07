import { useState } from "react";
import { AlphaTabApi, model } from "@coderline/alphatab";

interface Props {
  api: AlphaTabApi | null;
  playing: boolean;
  currentTimeMs: number;
  endTimeMs: number;
  tracks: { track: model.Track; name: string; muted: boolean }[];
  onToggleMute: (track: model.Track) => void;
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
}: Props) {
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);

  if (!api || !api.player) return null;
  const pct = endTimeMs > 0 ? Math.min(100, (currentTimeMs / endTimeMs) * 100) : 0;

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // tick 位置 setter（IAlphaSynth.tickPosition 可写）
    api.player!.tickPosition = Math.round(ratio * api.endTick);
  };

  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 bg-white px-4 py-2">
      <button
        onClick={() => (playing ? api.pause() : api.play())}
        className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500"
        title={playing ? "暂停" : "播放"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <button
        onClick={() => api.stop()}
        className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
        title="停止"
      >
        ■
      </button>
      <button
        onClick={() => {
          const next = !loop;
          setLoop(next);
          api.player!.isLooping = next;
        }}
        className={`grid h-8 w-8 place-items-center rounded-full border text-xs ${
          loop
            ? "border-indigo-300 bg-indigo-50 text-indigo-600"
            : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
        }`}
        title="循环播放"
      >
        ⟳
      </button>

      <div className="flex-1">
        <div className="relative h-2 cursor-pointer rounded-full bg-zinc-200" onClick={seek}>
          <div
            className="absolute left-0 top-0 h-2 rounded-full bg-indigo-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-0.5 text-center text-[11px] text-zinc-400">
          {fmtTime(currentTimeMs)} / {fmtTime(endTimeMs)}
        </div>
      </div>

      <label className="flex items-center gap-1 text-xs text-zinc-500">
        速度
        <select
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(v);
            api.player!.playbackSpeed = v;
          }}
          className="rounded border border-zinc-200 px-1 py-0.5"
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
          defaultValue={100}
          onChange={(e) => {
            api.player!.masterVolume = Number(e.target.value) / 100;
          }}
          className="w-20"
        />
      </label>

      {tracks.length > 0 && (
        <div className="flex items-center gap-1">
          {tracks.map(({ track, name, muted }) => (
            <button
              key={String(track.index)}
              onClick={() => onToggleMute(track)}
              className={`max-w-28 truncate rounded-md border px-2 py-1 text-xs ${
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
  );
}
