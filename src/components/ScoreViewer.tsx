// alphaTab 封装：加载乐谱字节，渲染谱面 + 内置合成器播放
import { useEffect, useRef } from "react";
import { AlphaTabApi, Settings, model, synth } from "@coderline/alphatab";

export interface ViewerCallbacks {
  onScoreLoaded?: (score: model.Score, trackInfos: { track: model.Track; name: string }[]) => void;
  onPlayerState?: (playing: boolean) => void;
  onPosition?: (currentTimeMs: number, endTimeMs: number) => void;
  onFinished?: () => void;
}

interface Props {
  data: Uint8Array | null;
  onReady?: (api: AlphaTabApi) => void;
  callbacks?: ViewerCallbacks;
}

/// 声音字体（GeneralUser GS，打包进 public/soundfont/）
export const SOUNDFONT_URL = "/soundfont/GeneralUser.sf2";

// alphaTab 通过该全局变量定位 Bravura 字体目录
// （Vite 打包后 import.meta.url 不可靠；public/font/ 双保险）
(window as unknown as { ALPHATAB_FONT: string }).ALPHATAB_FONT = "/font/";

export default function ScoreViewer({ data, onReady, callbacks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // 初始化 api（一次）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const settings = new Settings();
    settings.core.engine = "svg";
    // worker 由 @coderline/alphatab-vite 插件配置，保持默认开启
    settings.player.enablePlayer = true;
    settings.player.soundFont = SOUNDFONT_URL;

    const api = new AlphaTabApi(el, settings);
    apiRef.current = api;

    api.scoreLoaded.on((score) => {
      cbRef.current?.onScoreLoaded?.(
        score,
        score.tracks.map((t) => ({ track: t, name: t.name })),
      );
    });
    api.playerStateChanged.on((args) => {
      cbRef.current?.onPlayerState?.(args.state === synth.PlayerState.Playing);
    });
    api.playerPositionChanged.on((args) => {
      cbRef.current?.onPosition?.(args.currentTime, args.endTime);
    });
    api.playerFinished.on(() => {
      cbRef.current?.onFinished?.();
    });

    readyRef.current?.(api);

    return () => {
      try {
        api.destroy();
      } catch {
        // ignore
      }
      apiRef.current = null;
    };
  }, []);

  // 加载数据变化（自动分流：alphaTex 文本 vs 二进制谱格式）
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !data) return;
    const head = new TextDecoder().decode(data.subarray(0, 16)).trimStart();
    if (head.startsWith("\\")) {
      // AI 六线谱识别产出的 alphaTex
      api.tex(new TextDecoder().decode(data));
    } else {
      api.load(data);
    }
  }, [data]);

  return <div ref={containerRef} className="at-viewer flex-1 bg-white" />;
}
