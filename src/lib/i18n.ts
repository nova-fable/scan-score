import { create } from "zustand";

/// 轻量双语:中文原文作 key,词典只管 zh→en;
/// 动态文案用 {n} 占位:t("已导入 {n} 个文件", { n: 3 })。
/// 语言状态在 zustand 里,订阅组件随切换自动重渲染。

export type Lang = "zh" | "en";

const EN: Record<string, string> = {
  // ---- 侧栏 / 全局 ----
  "曲库": "Library",
  "歌单": "Playlists",
  "统计": "Stats",
  "设置": "Settings",
  "扫描 · 识别 · 播放": "Scan · Recognize · Play",
  "快捷键（?）": "Shortcuts (?)",
  "OMR: Audiveris · 渲染播放: alphaTab": "OMR: Audiveris · Render/Play: alphaTab",
  "关闭提示": "Dismiss",
  "取消": "Cancel",
  "删除": "Delete",
  "保存": "Save",
  "加载中…": "Loading…",
  "导入中…": "Importing…",
  "确认": "Confirm",
  "关闭": "Close",
  "重试": "Retry",

  // ---- 曲库 ----
  "共 {n} 册": "{n} scores",
  "{a} / {b} 册": "{a} / {b}",
  "搜索标题 / 作曲者…": "Search title / composer…",
  "搜索标题或作曲者": "Search title or composer",
  "全部乐器": "All instruments",
  "钢琴": "Piano",
  "吉他": "Guitar",
  "其他": "Other",
  "全部状态": "All statuses",
  "待识别": "Imported",
  "识别中": "Recognizing",
  "可播放": "Playable",
  "识别失败": "Failed",
  "排序：添加顺序": "Sort: date added",
  "排序：标题": "Sort: title",
  "队列": "Queue",
  "批量管理": "Batch",
  "已选 {n}": "{n} selected",
  "全选": "Select all",
  "识别所选": "Recognize selected",
  "删除所选": "Delete selected",
  "导入文件夹": "Import folder",
  "导入乐谱": "Import scores",
  "粘贴导入": "Paste import",
  "把剪贴板里的截图 / 图片直接导入（⌘V）": "Import a screenshot/image from clipboard (⌘V)",
  "松开以导入乐谱": "Drop to import",
  "曲库还是空的": "Your library is empty",
  "把 PDF / PNG / MusicXML / Guitar Pro 文件拖进来、⌘V 粘贴截图，或":
    "Drop PDF / PNG / MusicXML / Guitar Pro files, paste a screenshot with ⌘V, or",
  "没有匹配的曲谱": "No matching scores",
  "清除筛选": "Clear filters",
  "识别": "Recognize",
  "选择": "Select",
  "取消选择 {t}": "Deselect {t}",
  "选择 {t}": "Select {t}",
  "检测到 {n} 个乐谱文件": "{n} score files found",
  "合并为一首曲子": "Merge into one score",
  "多张图片按文件名顺序拼接成连续谱面，一次识别（适合分页扫描的同一首）":
    "Stitch multiple images into one continuous score, recognized in one pass (for multi-page scans of the same piece)",
  "删除曲谱": "Delete score",
  "删除所选曲谱": "Delete selected scores",
  "将永久删除所选的 {n} 个曲谱，文件将一并删除。删除后 30 秒内可撤销。":
    "Permanently deletes {n} selected scores and their files. Undo available for 30 seconds.",
  "将永久删除「{t}」，文件将一并删除。删除后 30 秒内可撤销。":
    "Permanently deletes “{t}” and its files. Undo available for 30 seconds.",
  "已删除 {t}": "Deleted {t}",
  "撤销": "Undo",
  "正在删除，无法撤销": "Deletion in progress, cannot undo",
  "已撤销删除": "Delete undone",
  "已导入 {n} 个文件{skip}": "Imported {n} file(s){skip}",
  "，跳过 {n} 个：{names}{more}": ", skipped {n}: {names}{more}",
  "等": " etc.",
  "导入失败：{e}": "Import failed: {e}",
  "已合并导入为一首曲子（待识别）": "Merged into one score (pending recognition)",
  "合并导入失败：{e}": "Merge import failed: {e}",
  "文件夹里没有找到乐谱图片 / PDF": "No score images / PDF found in that folder",
  "剪贴板里没有图片": "No image in clipboard",
  "已导入剪贴板图片「{t}」（待识别）": "Imported clipboard image “{t}” (pending recognition)",

  // ---- 详情 / 播放 ----
  "← 曲库": "← Library",
  "标题": "Title",
  "作曲者": "Composer",
  "标签（顿号分隔）": "Tags (、-separated)",
  "编辑信息": "Edit info",
  "暂停": "Pause",
  "播放": "Play",
  "停止": "Stop",
  "循环播放": "Loop",
  "循环播放开 / 关（详情页）": "Loop on/off (score page)",
  "标记 A 点": "Mark point A",
  "标记 B 点": "Mark point B",
  "清除 A-B 循环": "Clear A-B loop",
  "A-B 循环：播放到目标位置时依次按下 A、B":
    "A-B loop: while playing, press A then B at the target positions",
  "播放进度": "Playback position",
  "循环段落": "Saved segments",
  "给这段起个名…": "Name this segment…",
  "框好 A-B 后,在这里命名保存成循环段落。":
    "Set an A-B range, then name and save it as a loop segment here.",
  "还没有保存的段落。": "No saved segments yet.",
  "删除段落 {t}": "Delete segment {t}",
  "节拍器": "Metronome",
  "节拍音量": "Click volume",
  "预备拍": "Count-in",
  "开始播放前先给一小节预备拍": "Give one bar of count-in before playback",
  "开始识别": "Start recognition",
  "重新识别": "Re-recognize",
  "识别中…": "Recognizing…",
  "正在识别，进度 {p}%": "Recognizing… {p}%",
  "取消识别": "Cancel recognition",
  "这份谱还没有识别，点击上方「开始识别」":
    "Not recognized yet — click “Start recognition” above",
  "原图": "Original",
  "对照原图": "Show original",
  "隐藏原图对照": "Hide original",
  "导出": "Export",
  "导出 MIDI": "Export MIDI",
  "导出乐谱文件": "Export source file",
  "导出打印页": "Print sheet",
  "更多操作": "More actions",
  "缩小": "Zoom out",
  "放大": "Zoom in",
  "切换滚动方向": "Toggle scroll direction",
  "横向": "Horizontal",
  "分页": "Paged",
  "速度": "Speed",
  "音量": "Volume",
  "节拍器音量": "Metronome volume",
  "移调": "Transpose",
  "移调(半音)": "Transpose (semitones)",
  "只影响播放声音，谱面不变；打击乐不动":
    "Changes playback pitch only; notation unchanged; drums untouched",
  "移调（点击归零）": "Transpose (click to reset)",
  "播放速度": "Playback speed",
  "播放速度（点击回到 1x）": "Playback speed (click for 1x)",
  "开始录音": "Start recording",
  "停止录音": "Stop recording",
  "录音(跟着谱子演奏,录下来回放对比)":
    "Record yourself playing along, then compare on playback",
  "我的录音": "My recordings",
  "回放": "Play back",
  "删除录音": "Delete recording",
  "还没有录音——按下 REC 跟着谱子演奏试试。":
    "No recordings yet — hit REC and play along.",
  "轨道": "Track",
  "静音轨道 {t}": "Mute track {t}",
  "取消静音轨道 {t}": "Unmute track {t}",
  "乐谱文件读取失败": "Failed to read the score file",
  "原图对照": "Original overlay",
  "第 {a} / {b} 页": "Page {a} / {b}",
  "上一页": "Previous page",
  "下一页": "Next page",
  "原始扫描图": "Original scan",
  "点击谱面定位小节": "Click to locate a bar",
  "点击谱面自动定位小节": "Click the scan to locate a bar",
  "这张图没分析出谱线系统,无法点击定位":
    "No staff systems detected in this image; click-to-locate unavailable",

  // ---- 校对编辑器 ----
  "校对编辑器 — 原图对照 · alphaTex": "Proofread — original · alphaTex",
  "滚动同步": "Scroll sync",
  "关闭校对编辑器": "Close proofreader",
  "alphaTex · 共 {n} 小节": "alphaTex · {n} bars",
  "光标在第 {n} 小节": "Caret at bar {n}",
  "跳转到小节": "Go to bar",
  "小节": "Bars",
  "跳转": "Go",
  "品.弦（5.4 = 4弦5品）· :4/:8/:16 时值 · r 休止 · x.弦 闷音 · {h}{p}{s} 击勾滑 · | 分小节":
    "string.fret (5.4 = 4th string, 5th fret) · :4/:8/:16 durations · r rest · x.弦 mute · {h}{p}{s} hammer/pull/slide · | bar",
  "有未保存的修改": "Unsaved changes",
  "放弃未保存的修改？": "Discard unsaved changes?",
  "校对编辑器的修改尚未保存，关闭后将丢失。":
    "Proofreader changes are unsaved and will be lost.",
  "放弃修改": "Discard",
  "保存并刷新": "Save & reload",
  "已保存": "Saved",
  "保存失败：{e}": "Save failed: {e}",
  "识别引擎日志": "Engine log",
  "关闭日志": "Close log",
  "（该任务无日志记录）": "(no log for this job)",

  // ---- 练习统计 ----
  "练习统计": "Practice stats",
  "近 7 天": "Last 7 days",
  "共 {t}": "Total {t}",
  "小时": "h",
  "分钟": "min",
  "秒": "s",
  "每曲合计": "Per score",
  "次": "sessions",
  "最近 {d}": "last {d}",
  "还没有练习记录——打开一首曲子播放就会开始累计。":
    "No practice logged yet — play a score and it starts tracking.",

  // ---- 歌单 ----
  "新歌单名称": "New playlist name",
  "新建": "New",
  "连播": "Play through",
  "从歌单移除 {t}": "Remove {t} from playlist",
  "移出歌单": "Remove",
  "删除歌单 {t}": "Delete playlist {t}",
  "删除歌单": "Delete playlist",
  "将删除歌单「{t}」。歌单里的曲谱不受影响。":
    "Deletes playlist “{t}”. Scores are not affected.",
  "已创建歌单「{t}」": "Created playlist “{t}”",
  "已删除歌单(曲目不受影响)": "Playlist deleted (scores unaffected)",
  "已加入歌单「{t}」": "Added to playlist “{t}”",
  "加入歌单 · {t}": "Add to playlist · {t}",
  "左侧选一个歌单,或新建一个。": "Pick a playlist on the left, or create one.",
  "歌单是空的——在曲库卡片或详情页「⋯」里选「加入歌单」。":
    "Empty playlist — use “Add to playlist” from a score card or the ⋯ menu.",
  "佚名": "Unknown",

  // ---- 设置 ----
  "识别引擎 (Audiveris)": "Recognition engine (Audiveris)",
  "留空则自动探测：打包内置 → /Applications/Audiveris.app → 环境变量 AUDIVERIS_CMD。可指定启动器路径（如 /Applications/Audiveris.app/Contents/MacOS/Audiveris）。":
    "Leave empty to auto-detect: bundled → /Applications/Audiveris.app → env AUDIVERIS_CMD. Or set the launcher path.",
  "自动探测": "Auto-detect",
  "当前状态：": "Status: ",
  "已找到 ✓ {p}": "Found ✓ {p}",
  "未找到 ✗（请安装 Audiveris 或填写路径）": "Not found ✗ (install Audiveris or set the path)",
  "检测中…": "Detecting…",
  "AI 六线谱识别（实验性）": "AI tab transcription (experimental)",
  "· 已配置 ✓": "· configured ✓",
  "· 未配置": "· not configured",
  "开源 OMR 无法识别六线谱。配置视觉大模型后，检测到六线谱输入时自动改用 AI 转录（需联网，按调用量计费）。兼容 OpenAI chat/completions 协议。":
    "Open-source OMR cannot read tablature. Configure a vision model and tablature input is transcribed by AI instead (online, pay per call). Works with any OpenAI-compatible chat/completions endpoint.",
  "选择服务商（自动填接口地址）": "Pick provider (fills the API base)",
  "接口地址 (API Base)": "API base",
  "获取模型列表": "Fetch models",
  "推理模式": "Reasoning mode",
  "允许推理（更准，更慢更贵）": "Reasoning on (better, slower, pricier)",
  "关闭推理（更快更省）": "Reasoning off (faster, cheaper)",
  "长输出预算已自动配置，无需手动调整": "Output budget is configured automatically",
  "测试连接": "Test connection",
  "清除已保存的 Key": "Clear saved API key",
  "模型": "Model",
  "模型名称": "Model name",
  "展开模型列表": "Expand model list",
  "列表为空——先点「获取模型列表」，或直接手动输入":
    "Empty — fetch models first, or type one manually",
  "数据目录": "Data directory",
  "曲库数据库与乐谱文件存放位置": "Where the library database and score files live",
  "识别参数": "Recognition parameters",
  "低分辨率图片自动放大的目标宽度（谱线间距越大约识别越稳，默认 2400px）；Audiveris 附加命令行参数（留空即可）。":
    "Target width for upscaling low-res images (wider staff spacing is more stable; default 2400px); extra Audiveris CLI arguments (leave empty).",
  "放大宽度": "Upscale width",
  "附加参数": "Extra arguments",
  "留空": "empty",
  "备份与恢复": "Backup & restore",
  "备份包含曲库数据库与全部乐谱文件。恢复会覆盖现有数据，完成后需重启应用。":
    "Backups include the library database and all score files. Restoring overwrites data and requires an app restart.",
  "导出备份…": "Export backup…",
  "从备份恢复…": "Restore backup…",
  "从备份恢复": "Restore backup",
  "恢复备份将覆盖当前全部曲库数据（数据库与乐谱文件），且完成后需重启应用生效。":
    "Restoring overwrites ALL library data (database and files), effective after an app restart.",
  "覆盖恢复": "Overwrite & restore",
  "关于": "About",
  "本项目以 MIT 许可发布": "Released under the MIT license",
  "（AGPL-3.0，独立进程调用）": "(AGPL-3.0, invoked as a separate process)",
  "（MIT）": "(MIT)",
  "音源 GeneralUser GS（S. Christian Collins，免费分发）· SONiVOX EAS（Apache-2.0）":
    "Soundfont GeneralUser GS (S. Christian Collins, freely distributable) · SONiVOX EAS (Apache-2.0)",
  "语言": "Language",
  "跟随系统": "System",
  "中文": "中文",
  "English": "English",

  // ---- 详情补充 ----
  "收起对照": "Hide overlay",
  "新窗口打开原图": "Open original in new window",
  "原图选项": "Original options",
  "日志": "Log",
  "找 Guitar Pro 版本 ↗": "Find Guitar Pro version ↗",
  "未知错误": "unknown error",
  "切换到日间看谱": "Switch to day view",
  "切换到夜间看谱": "Switch to night view",
  "夜间看谱": "Night view",
  "日间": "Day",
  "夜间": "Night",
  "识别中… {p}% {msg}": "Recognizing… {p}% {msg}",
  "识别失败：{e}": "Recognition failed: {e}",
  "待识别：导入的扫描件尚未进行光学识别":
    "Imported: the scan has not been recognized yet",
  "覆盖并重识": "Overwrite & re-recognize",
  "当前谱文包含已保存的校对内容，重新识别将用新的识别结果覆盖它。原扫描图保留。":
    "The score already has proofread content. Re-recognizing overwrites it with fresh output. The original scan is kept.",
  "将永久删除「{t}」及其全部文件。删除后 30 秒内可在曲库撤销。":
    "Permanently deletes “{t}” and all its files. Undo available for 30 seconds in the library.",
  "打印版已在浏览器打开,⌘P 即可打印":
    "Print sheet opened in your browser — press ⌘P to print",
  "谱面还没渲染完成,稍后再试": "Score not rendered yet — try again shortly",
  "主音量": "Master volume",
  "录音保存失败：{e}": "Failed to save recording: {e}",
  "无法开始录音：{e}": "Cannot start recording: {e}",
  "回放失败：{e}": "Playback failed: {e}",
  "加载乐谱…": "Loading score…",
  "队列 {n}": "Queue {n}",
  "谱架还是空的": "The stand is empty",
  "导入": "Import",
  "删除段落": "Delete segment",
  "段落名称": "Segment name",

  "UI 语言:跟随系统 / 中文 / English": "UI language: system / 中文 / English",
  "已恢复 {n} 个文件，请重启应用生效": "Restored {n} files — restart the app to apply",
  "已导出备份": "Backup exported",
  "已清除保存的 API Key": "Saved API key cleared",
  "获取模型列表中…": "Fetching models…",
  "获取到 {n} 个模型，点模型框右侧箭头选择": "Got {n} models — pick one from the arrow menu",
  "该平台不支持列表接口（{e}…），可手动输入模型名":
    "This provider has no list endpoint ({e}…) — type the model name manually",
  "测试中…": "Testing…",
  "失败：{e}": "Failed: {e}",
  "收起 AI 六线谱识别设置": "Collapse AI tab settings",
  "展开 AI 六线谱识别设置": "Expand AI tab settings",

  // ---- 快捷键 ----
  "快捷键": "Shortcuts",
  "播放 / 暂停（曲谱详情页）": "Play / pause (score page)",
  "快退 / 快进 5 秒": "Seek −5s / +5s",
  "节拍器开 / 关（详情页）": "Metronome on/off (score page)",
  "跳到第 n 小节（详情页）": "Jump to bar n (score page)",
  "横向滚动谱面": "Scroll the score horizontally",
  "关闭弹窗 · 退出编辑 · 逐层退出": "Close dialog · exit edit · step back",
  "保存元数据（编辑态）": "Save metadata (while editing)",
  "聚焦曲库搜索": "Focus library search",
  "粘贴剪贴板图片导入（曲库页）": "Paste image import (library)",
  "范围多选曲谱": "Range-select scores",
  "打开本说明": "Open this help",
  "快捷键在对应页面生效；输入框内输入时不响应。A-B 循环：播放到目标位置时依次按播放条上的 A、B。":
    "Shortcuts apply on their pages; typing in inputs bypasses them. A-B loop: press A then B on the player at the target positions.",
};

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  initFromSystem: () => void;
}

function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export const useLang = create<LangState>((set) => ({
  "lang": "zh",
  setLang: (l) => set({ lang: l }),
  initFromSystem: () => set({ lang: detectLang() }),
}));

export interface TParams {
  [k: string]: string | number;
}

/// 翻译:zh 原文作 key;lang=zh 直接返回原文(占位符仍要替换)
export function translate(lang: Lang, key: string, params?: TParams): string {
  let out = lang === "en" ? (EN[key] ?? key) : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/// 组件里用 useT() 拿到绑定当前语言的 t(语言切换时自动重渲染)
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: string, params?: TParams) => translate(lang, key, params);
}
