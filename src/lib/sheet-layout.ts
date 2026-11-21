/// 扫描谱面版面分析:谱线行聚类出「系统」,再在每个系统的纵向带内找小节线(竖线)。
///
/// 用途:校对编辑器里点击原图 → 估计对应小节。全靠 canvas 像素统计,无外部依赖。
/// 教训沿用 tabdetect:浅灰谱线用「行中位数亮度显著低于背景」判定,对深浅谱线通吃;
/// 暗像素计数/Otsu 都会漏浅灰线。

export interface SheetSystem {
  top: number;
  bottom: number;
  /// 系统内的小节线 x 坐标(含系统起始线,升序)
  barlines: number[];
}

interface Band {
  y0: number;
  y1: number;
}

const LINE_MEDIAN_MAX = 236; // 谱线行:中位数亮度低于背景(白纸≈250)
const DARK = 165; // 竖线像素:灰度阈值
const SAMPLE_STEP = 4; // 采样步长(性能)

function rowMedians(data: ImageData): number[] {
  const { width, height } = data;
  const medians = new Array<number>(height);
  const buf: number[] = [];
  for (let y = 0; y < height; y++) {
    buf.length = 0;
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const i = (y * width + x) * 4;
      const g = (data.data[i] * 299 + data.data[i + 1] * 587 + data.data[i + 2] * 114) / 1000;
      buf.push(g);
    }
    buf.sort((a, b) => a - b);
    medians[y] = buf[Math.floor(buf.length / 2)] ?? 255;
  }
  return medians;
}

/// 相邻暗行合并成带(一条谱线)
function darkBands(medians: number[]): Band[] {
  const bands: Band[] = [];
  let start = -1;
  for (let y = 0; y < medians.length; y++) {
    if (medians[y] < LINE_MEDIAN_MAX) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      bands.push({ y0: start, y1: y - 1 });
      start = -1;
    }
  }
  if (start >= 0) bands.push({ y0: start, y1: medians.length - 1 });
  return bands;
}

/// 带聚类成系统:带间距超过前一带高的 2.5 倍即认为换系统
function clusterSystems(bands: Band[]): { top: number; bottom: number }[] {
  const systems: { top: number; bottom: number }[] = [];
  let cur: Band | null = null;
  let lastY1 = -1;
  let lastH = 2;
  for (const b of bands) {
    const gap = lastY1 >= 0 ? b.y0 - lastY1 : Infinity;
    if (cur === null || gap > lastH * 2.5) {
      if (cur) systems.push({ top: cur.y0, bottom: cur.y1 });
      cur = { ...b };
    } else {
      cur.y1 = b.y1;
    }
    lastY1 = b.y1;
    lastH = Math.max(2, b.y1 - b.y0);
  }
  if (cur) systems.push({ top: cur.y0, bottom: cur.y1 });
  return systems;
}

/// 在 [top,bottom] 纵向带内找「贯穿谱面的竖线」列(小节线/系统起始线)
function barlineColumns(data: ImageData, top: number, bottom: number): number[] {
  const { width } = data;
  const d = data.data;
  const span = bottom - top + 1;
  const hits: number[] = [];
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = top; y <= bottom; y++) {
      const i = (y * width + x) * 4;
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      if (g < DARK) dark++;
    }
    if (dark >= span * 0.8) hits.push(x);
  }
  // 相邻列合并成一条线,取中心
  const cols: number[] = [];
  let runStart = -1;
  for (let i = 0; i <= hits.length; i++) {
    const prev = hits[i - 1];
    const cur = hits[i];
    if (cur !== undefined && prev !== undefined && cur - prev <= 2) continue;
    if (runStart >= 0 && prev !== undefined) cols.push(Math.round((runStart + prev) / 2));
    runStart = cur ?? -1;
  }
  return cols;
}

/// 主入口:分析一张谱图,返回系统列表(含各自的小节线)。失败/无谱线返回 null。
export function analyzeSheetLayout(img: HTMLImageElement): SheetSystem[] | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h || w < 80 || h < 80) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);

    const bands = darkBands(rowMedians(data));
    if (bands.length < 5) return null;
    const systems = clusterSystems(bands);
    if (systems.length === 0) return null;
    return systems.map((sys) => ({
      ...sys,
      barlines: barlineColumns(data, sys.top - 2, sys.bottom + 2),
    }));
  } catch {
    return null;
  }
}
