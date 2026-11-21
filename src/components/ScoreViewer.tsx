// alphaTab 封装：加载乐谱字节，渲染谱面 + 内置合成器播放
import { useEffect, useRef } from "react";
import { AlphaTabApi, ScrollMode, Settings, model, synth } from "@coderline/alphatab";
import { normalizeScoreData } from "../lib/musicxml";

/// 播放跟随方式：
/// - line：每换一条系统就把该系统顶对齐到容器顶（ScrollMode.Continuous，MuseScore 那种）
/// - onDemand：当前小节跑出视野才滚动（ScrollMode.OffScreen，画面更安静，适合反复练同一段）
export type FollowMode = "line" | "onDemand";

export interface ViewerCallbacks {
  onScoreLoaded?: (score: model.Score, trackInfos: { track: model.Track; name: string }[]) => void;
  onPlayerState?: (playing: boolean) => void;
  onPosition?: (currentTimeMs: number, endTimeMs: number) => void;
  onFinished?: () => void;
}

interface Props {
  data: Uint8Array | null;
  /// 暗场看谱：谱面用奶油墨、谱线降一档（层级：音符 > 小节线 > 谱线）
  night?: boolean;
  /// 循环练习中：当前小节洗色与拍点竖线加重（与校准轨金标呼应）
  loopActive?: boolean;
  /// 播放跟随方式（见 FollowMode）
  follow?: FollowMode;
  onReady?: (api: AlphaTabApi) => void;
  callbacks?: ViewerCallbacks;
}

/// 声音字体（GeneralUser GS，打包进 public/soundfont/）
export const SOUNDFONT_URL = "/soundfont/GeneralUser.sf2";

// alphaTab 的 Color 类没有从 ESM 包导出，换色只能走 Settings.fillFromJson
// （部分 JSON 只覆盖给出的字段，其余设置保持不变）
const NIGHT_RESOURCES = {
  mainGlyphColor: "#e8e0cb",
  secondaryGlyphColor: "rgba(232, 224, 203, 0.45)",
  staffLineColor: "rgba(232, 224, 203, 0.38)",
  barSeparatorColor: "#b9b09a",
  scoreInfoColor: "#e8e0cb",
  barNumberColor: "#d5b85c",
};

// alphaTab 1.9 出厂默认值（日间恢复用）
const DAY_RESOURCES = {
  mainGlyphColor: "#000000",
  secondaryGlyphColor: "rgba(0, 0, 0, 0.4)",
  staffLineColor: "rgb(165, 165, 165)",
  barSeparatorColor: "rgb(34, 34, 17)",
  scoreInfoColor: "#000000",
  barNumberColor: "rgb(200, 0, 0)",
};

// 字体目录必须显式写进 settings：alphaTab 的 Environment.fontDirectory 在模块求值时就固定了，
// 而这里的 import 早于任何赋值，所以打包后它会落到 <assets>/font/（不存在）→ 字体加载失败 →
// 谱面静默不渲染（只有声音，因为播放不需要字体）。index.html 里的 ALPHATAB_FONT 是同一件事的兜底。
const FONT_DIRECTORY = "/font/";

const scrollModeOf = (follow: FollowMode) =>
  follow === "onDemand" ? ScrollMode.OffScreen : ScrollMode.Continuous;

export default function ScoreViewer({ data, night = false, loopActive = false, follow = "line", onReady, callbacks }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // 初始化 api（一次）
  useEffect(() => {
    const el = containerRef.current;
    const scroller = scrollRef.current;
    if (!el || !scroller) return;

    const settings = new Settings();
    settings.core.engine = "svg";
    // worker 由 @coderline/alphatab-vite 插件配置，保持默认开启
    settings.player.enablePlayer = true;
    settings.core.fontDirectory = FONT_DIRECTORY;
    settings.player.soundFont = SOUNDFONT_URL;
    // 拍点光标默认是平滑追帧；减动效偏好下改成逐拍跳（alphaTab 没有这个开关，得自己接）
    settings.player.enableAnimatedBeatCursor = !window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // 播放跟随滚动：alphaTab 默认滚 "html,body"，而本页 body 不滚动（滚动的是 .at-viewer），
    // 不指到真正的滚动容器上，播放到屏幕末尾就永远不会翻页。
    // 必须指到 api 容器的**父级**——指容器自身会让 getOffset 把当前 scrollTop 累加进去，逐次漂移。
    settings.player.scrollElement = scroller;
    settings.player.scrollMode = scrollModeOf(follow);

    const api = new AlphaTabApi(el, settings);
    apiRef.current = api;

    // Shift + 滚轮 = 横向滚动(分页布局下翻列、横向布局下加速翻页;浏览器默认 shift+wheel 是横向,但容器未必接)
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });

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
      scroller.removeEventListener("wheel", onWheel);
      try {
        api.destroy();
      } catch {
        // ignore
      }
      apiRef.current = null;
    };
  }, []);

  // 暗场换色：alphaTab 的谱面颜色只能改渲染资源后重绘，没有 CSS 入口
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.settings.fillFromJson({
      display: { resources: night ? NIGHT_RESOURCES : DAY_RESOURCES },
    });
    api.updateSettings();
    if (api.score) api.render();
  }, [night]);

  // 切换跟随方式：updateSettings() 会经 _setupOrDestroyPlayer → _updateCursors 重建滚动处理器，
  // 不需要重绘，播放中切换也不中断
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.settings.player.scrollMode = scrollModeOf(follow);
    api.updateSettings();
  }, [follow]);

  // 加载数据变化（自动分流：alphaTex 文本 vs 二进制谱格式）
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !data) return;
    const head = new TextDecoder().decode(data.subarray(0, 16)).trimStart();
    if (head.startsWith("\\")) {
      // AI 六线谱识别产出的 alphaTex
      api.tex(new TextDecoder().decode(data));
    } else {
      // OMR 常把一页钢琴谱拆成多个 part，alphaTab 会把它们排成各自独立的系统
      // （顶部全是空谱表）——先合并成单 part 多谱表，合并失败就用原始数据
      api.load(normalizeScoreData(data) ?? data);
    }
  }, [data]);

  return (
    <div
      ref={scrollRef}
      className={`at-viewer flex-1 overflow-auto bg-paper-bright ${loopActive ? "at-loop" : ""}`}
    >
      {/* alphaTab 的容器（光标也挂在这里）；滚动交给外层，播放跟随才找得到正确的滚动容器 */}
      <div ref={containerRef} />
    </div>
  );
}
