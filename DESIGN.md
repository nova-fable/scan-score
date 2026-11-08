---
name: ScanScore
description: 乐谱扫描与播放 — 安静的琴房里，谱面与声音是主角
colors:
  metronome-indigo: "#4f46e5"
  metronome-indigo-hover: "#6366f1"
  metronome-indigo-soft: "#eef2ff"
  metronome-indigo-border: "#c7d2fe"
  metronome-indigo-deep: "#4338ca"
  metronome-indigo-focus: "#818cf8"
  danger-hover: "#dc2626"
  page-bg: "#f6f7f9"
  surface: "#ffffff"
  surface-sunken: "#fafafa"
  surface-placeholder: "#f4f4f5"
  border: "#e4e4e7"
  border-strong: "#d4d4d8"
  ink: "#1f2937"
  ink-body: "#52525b"
  ink-secondary: "#71717a"
  ink-faint: "#a1a1aa"
  ink-menu: "#3f3f46"
  toast-dark: "#27272a"
  terminal-dark: "#18181b"
  terminal-text: "#f4f4f5"
  status-waiting: "#fef3c7"
  status-waiting-text: "#b45309"
  status-working: "#dbeafe"
  status-working-text: "#1d4ed8"
  status-ready: "#d1fae5"
  status-ready-text: "#047857"
  status-failed: "#fee2e2"
  status-failed-text: "#b91c1c"
  danger: "#ef4444"
  warning-surface: "#fffbeb"
  warning-border: "#fcd34d"
  warning-icon: "#d97706"
  scrim: "rgba(0, 0, 0, 0.4)"
typography:
  page-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.6875rem"
    lineHeight: 1.34
  editor-mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: "0.75rem"
    lineHeight: 1.34
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  3xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.metronome-indigo}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.metronome-indigo-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  nav-item-active:
    backgroundColor: "{colors.metronome-indigo-soft}"
    textColor: "{colors.metronome-indigo-deep}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  toast:
    backgroundColor: "{colors.toast-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  pill-ready:
    backgroundColor: "{colors.status-ready}"
    textColor: "{colors.status-ready-text}"
---

# Design System: ScanScore

## Overview

**Creative North Star: "安静的琴房" (The Quiet Practice Room)**

ScanScore 是一间安静的琴房：白墙式的中性界面、克制的密度，让谱面与声音当主角。界面是房间里的家具——触手可及、毫不喧哗；唯一的亮点是那盏节拍器指示灯（节拍器靛蓝，#4f46e5），它亮起的地方就是该行动的地方。气质调性是**安静专注**与**干净利落**：面向长时间练琴与曲库整理的桌面重度使用，信息密度优先，装饰近乎为零。

系统是紧凑的桌面工具语汇：小尺寸控件、细边框、悬停才浮现的次要操作。深度靠 1px 边框与白卡对灰底的色调分层表达，阴影只在交互与浮层出现。五个状态色（琥珀/蓝/翡翠/红）是识别流水线的信号灯，不是调色盘上的第五、第六种口味。

明确排斥（confirmed anti-references）：**SaaS 仪表盘感**（密集彩色卡片+图表的"后台"气质）与**渐变/玻璃拟态**（渐变文字、发光阴影、backdrop-blur 面板）。

**Key Characteristics:**
- 单一强调色：靛蓝只属于可点击的主动作与激活态
- 边框优先：1px 锌灰边框承担分隔，阴影是交互的回应而非常态
- 紧凑桌面密度：text-sm 为基准、py-1.5/px-3 级别的控件内边距
- 原生系统字体（含 CJK 栈），零 webfont——离线应用的一致选择
- 白卡浮在冷灰纸面（#f6f7f9）上，滚动区即工作区

## Colors

色板是"中性纸面 + 一盏靛蓝指示灯 + 四盏状态信号灯"：95% 的屏幕是锌灰中性色与白色，靛蓝是唯一的强调色，状态色只在流水线状态出现。

### Primary

- **节拍器靛蓝 / Metronome Indigo** (#4f46e5): 唯一强调色。主动作按钮（导入乐谱、开始识别、保存）、播放键、进度条、多选框选中态（`accent-indigo-600`）、链接。它的稀缺就是它的含义：靛蓝亮起 = 可行动/已激活。
- **节拍器靛蓝·悬停** (#6366f1): 主按钮与进度条的 hover 态。
- **节拍器靛蓝·浅底** (#eef2ff): 激活态底色——侧栏选中项、A-B 循环激活、轨道 chip 激活、拖拽导入覆盖层。
- **节拍器靛蓝·描边** (#c7d2fe): 激活态与浅底态的边框。
- **节拍器靛蓝·深字** (#4338ca): 浅靛底上的文字（侧栏选中项、chip 激活文字）。
- **节拍器靛蓝·聚焦** (#818cf8): 输入框 focus 边框色。

### Neutral

- **琴房纸面 / Practice-Room Paper** (#f6f7f9): 应用页面底色，body 背景即它。
- **纯白琴谱 / Score White** (#ffffff): 侧栏、页头工具栏、卡片、弹层的表面色。
- **凹槽灰 / Recessed Zinc** (#fafafa): 设置页底、卡片内嵌区、浅提示区。
- **占位灰 / Placeholder Zinc** (#f4f4f5): 封面占位区、代码块底、终端文字色。
- **描边灰 / Hairline Zinc** (#e4e4e7): 1px 默认边框——分隔的默认答案。
- **重描边灰 / Strong Hairline** (#d4d4d8): 编辑态输入框、小控件边框。
- **墨色 / Ink** (#1f2937): 全局正文与标题（body 继承色）。
- **墨色·次级** (#52525b): 次要按钮文字、菜单项正文。
- **墨色·辅助** (#71717a): 标签、说明文字、图标按钮。
- **墨色·微弱** (#a1a1aa): 仅装饰字形与分隔符（♫、时间轴刻度）；**不得承载信息文字**——白底对比度 ≈2.1:1，信息文字下限为墨色·辅助 (#71717a, 4.6:1)。
- **菜单墨色** (#3f3f46): 下拉菜单项文字。
- **夜色吐司** (#27272a): 深色 toast 底。
- **终端黑** (#18181b) on **终端白** (#f4f4f5): 引擎日志终端块。

### Semantic Status（识别流水线信号灯，非装饰色）

- **待识别·琥珀** (#fef3c7 底 / #b45309 字): imported 状态 pill；节拍器激活态同族（#fffbeb 底 / #fcd34d 边 / #d97706 图标）；警示按钮（恢复备份、找 Guitar Pro）。
- **识别中·蓝** (#dbeafe 底 / #1d4ed8 字): processing 状态 pill 与队列角标。
- **可播放·翡翠** (#d1fae5 底 / #047857 字): ready 状态 pill；成功反馈文字。
- **识别失败·红** (#fee2e2 底 / #b91c1c 字): failed 状态 pill；**危险红** (#ef4444) 用于删除操作文字与错误信息。

### Named Rules

**The One Light Rule.** 节拍器靛蓝是整个应用唯一的强调色，用于主动作与激活态，占任意屏幕 ≤10%。若一个界面需要第二个强调色，先怀疑布局，不要加颜色。

**The Signal-Not-Decor Rule.** 琥珀/蓝/翡翠/红只用于识别流水线状态、危险操作与明确警示；绝不作装饰、图表或氛围色。

## Typography

**Body/UI Font:** 系统栈 `-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif`（macOS/Windows 原生 CJK 渲染）
**Editor/Log Font:** 系统等宽栈 `ui-monospace, SFMono-Regular, Menlo, …`（alphaTex 编辑器、引擎日志）

**Character:** 原生、无声、工具感——字体永远不抢戏，层级靠尺寸与字重两级跳（400/600），中文排版以 PingFang SC/微软雅黑为准。

### Hierarchy

- **Page Title** (600, 1.125rem): 页面级标题，目前仅设置页 h1；每屏至多一个。
- **Title** (600, 0.875rem): 卡片标题、弹窗标题、应用名——小而实的标题层。
- **Body** (400, 0.875rem): UI 正文、按钮文字、输入框文字的基准字号。
- **Label** (400, 0.75rem): 标签、状态 pill、辅助说明。
- **Micro** (400, 0.6875rem, line-height 1.34): 时间戳、微注、日志、alphaTex 提示条。
- **Editor Mono** (400, 0.75rem): alphaTex 校对编辑区、引擎日志终端。

### Named Rules

**The Native Voice Rule.** 只用系统字体栈，不引入任何 webfont——离线桌面应用，加载字体既慢又破坏原生感。字重只用 400（正文/按钮）与 600（标题/激活态）两档；**禁止 500**——Microsoft YaHei 没有 500，`font-medium` 在 Windows 上静默回落 400，强调会凭空消失。micro（11px/1.34）只用于等宽/数字语境（时间、日志、百分比），散文性注释一律用 label（12px）。

## Layout

应用是固定骨架的桌面工作台：左侧 **208px 侧栏**（w-52，白底、右缘 1px 边框：品牌区 + 导航 + 底部引擎署名），右侧主列按页面切换。窗口最小 1000×640，无响应式断点——这是桌面应用，不是网页。

- **页头工具栏**: 每页顶部的白色条（`border-b` 描边灰），**按功能分簇**——曲库页为「筛选簇（搜索+筛选，内距 8px）/ 批量簇（独立描边容器）/ 导入簇」三簇，簇间 16px、批量簇出现时其余主动作降级；详情页右侧为「次级簇（原图/导出/⋯，内距 8px）+ 识别主按钮」。工具栏可换行（`flex-wrap`），主按钮永远在最右。
- **曲库网格**: `repeat(auto-fill, minmax(200px, 1fr))`，间距 16px；卡片高度由封面区（h-36）+ 文本区决定。
- **设置页**: 单列 `max-w-2xl` 卡片堆叠，间距 16px，页面内边距 24px。
- **详情页**: 上（查看器，占满剩余高度）/ 下（播放条）的垂直切分；原图对照层从底部推入（max-h 40%）。
- **间距节奏**: 页面留白 20–24px，卡片内 12–16px，控件内 6–8px，相关元素间距 4–8px。密度整体偏紧。

## Elevation & Depth

**The Border-First Rule.** 分隔与结构靠 1px 描边灰边框和"白卡对灰底"的色调分层表达；阴影不是常态，是回应——只有悬停和浮层才允许它出现。静止的界面是完全扁平的。

### Shadow Vocabulary

- **card-rest** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): 卡片静止态，几乎不可察觉。
- **card-hover** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): 卡片悬停，卡片"抬起"的唯一时刻。
- **floating-action** (`0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): 悬浮在封面上的卡片操作按钮、多选框。
- **dropdown** (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): 下拉菜单、弹层。
- **modal** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): 模态弹窗，配合 `rgba(0,0,0,0.3–0.4)` 全屏遮罩。

## Shapes

圆角五级阶梯，8px 是绝对主力：**md 6px**（多选框、A/B 小按钮、悬浮小操作）、**lg 8px**（所有按钮、输入框、导航项、下拉、toast——"控件=lg"是肌肉记忆）、**xl 12px**（卡片、设置行）、**2xl 16px**（模态弹窗、拖拽覆盖层）、**full**（仅限圆形播放/走带按钮与队列角标 pill）。边框恒为 1px（拖拽覆盖层例外：2px 虚线靛蓝）；不做异形裁切、不带斜角。

## Components

### Buttons

- **Shape:** 8px 圆角（lg），控件高度由 py-1.5 + text-sm 决定（约 30px）。
- **Primary:** 节拍器靛蓝底 (#4f46e5) + 白字（400 字重——颜色已承担强调），px-3/px-4 py-1.5；hover 加亮至 #6366f1；禁用 `opacity-50`。每屏主动作至多一个；出现第二个主动作场景（如批量模式）时，其余主动作降级为 Secondary。
- **Secondary:** 白底 + 描边灰边框 + 墨色·次级字，hover 微灰底 (#f5f5f5→zinc-50)。工具栏的默认形态。
- **Destructive:** 危险红字 (#dc2626) + 红系浅边框，hover 红系浅底；删除类动作专用，永不使用靛蓝。确认模态中的实心确认键为危险红底 (#ef4444) 白字、hover #dc2626。
- **Warning:** 琥珀浅底 (#fffbeb) + 琥珀边框 (#fcd34d) + 琥珀字 (#b45309)，用于"恢复备份""找 Guitar Pro 版本"类谨慎动作。
- **Ghost icon:** 无底色图标按钮（✎ ✕ − ＋），墨色·辅助字，hover 变靛蓝或加深；缩放控件成对出现在带边框的容器内。

### Transport（播放条）

- **Shape:** 圆形（full）。播放键 36px 靛蓝实心白字；其余走带键 32px 白底描边灰。
- **Toggle 激活态:** 靛蓝浅底 (#eef2ff) + 靛蓝边框 (#c7d2fe) + 靛蓝字；节拍器激活态是唯一的琥珀色走带键，外圈带 0.8s 脉动光环（北极星的「节拍器灯」；`prefers-reduced-motion` 下静止）。
- **A-B 区间可视化:** 循环区间以浅靛 (#818cf8 系) 实底段显示在进度轨道上，与播放填充叠加后区间始终可辨——练习者不需要记住 A 点在哪。
- A-B 循环是连体分段控件（左右圆角拼接），激活后出现清除按钮 ✕。
- 进度条：2px 高圆角轨道（描边灰），靛蓝填充，点击 seek；时间用 Micro 字号居中显示。
- 轨道 chip：圆角 6px 小块，激活=靛蓝浅底+靛蓝边框，静音=描边灰+删除线。

### Cards / Containers

- **Corner Style:** 12px（xl）。
- **Background:** 纯白；封面占位区为占位灰 (#f4f4f5)，无封面时显示 ♫ 字形（#d4d4d8）。
- **Shadow Strategy:** card-rest → card-hover（见 Elevation）。
- **Border:** 1px 描边灰。
- **Internal Padding:** 12px（p-3）。
- **无封面占位:** 灰底 (#f4f4f5) 上居中手绘「五线谱 + 四分音符」SVG（描边 #d4d4d8、符头 #a1a1aa）——领域自有的占位签名，不用 emoji 或字符字形。
- **悬停浮现:** 卡片操作按钮与多选框：多选框常驻左上，操作按钮组 `opacity-0 → group-hover:opacity-100` 右上浮现，均为白底 90% 不透明小片（6px 圆角）。

### Inputs / Fields

- **Style:** 白底 + 1px 描边灰边框 + 8px 圆角 + px-3 py-1.5 + text-sm；无内阴影。
- **Focus:** 仅边框变色至靛蓝·聚焦 (#818cf8)——**不使用 ring、不发光、不加阴影**。
- **Error / Disabled:** 错误文字用危险红行内展示；禁用 `opacity-50`。

### Navigation

- 侧栏导航项：8px 圆角、px-3 py-2、text-sm 左对齐；激活=靛蓝浅底+靛蓝·深字+`font-semibold`，未激活=墨色·次级字+hover 灰底。
- 页头返回/切换按钮（← 曲库）与工具栏 Secondary 按钮同形。
- 下拉菜单：白底、描边灰边框、8px 圆角、py-1，项为 px-3 py-1.5 text-sm hover 灰底，选中项靛蓝字加粗。

### Modals & Overlays

- 模态：全屏遮罩 `rgba(0,0,0,0.3–0.4)` 居中白色面板，16px 圆角、`shadow-xl`、p-4/p-5；标题行 Title 字号 + 右上 ✕。宽度按内容定档：420px（确认/导入）/ 720px（日志）/ 1100px（校对编辑器）。全部模态带 `role="dialog"` + 焦点陷阱 + Esc 关闭；承载输入的模态（编辑器、确认）不响应点遮罩关闭，纯查看模态（日志）响应。入场：遮罩 150ms 淡入 + 面板 180ms 上浮（8px + 0.98 缩放，ease-out）；下拉菜单同语。全部尊重 `prefers-reduced-motion`。
- **确认模态**（420px）：标题 + 一句后果说明 + 危险红实心确认键 + 取消。一切破坏性操作（删除、覆盖恢复）的唯一守卫——`window.confirm` 在 wry 中不可用，禁止使用。配合 6 秒撤销 toast（软删除）。
- Toast：底部居中深色条（#27272a、白字、8px 圆角、`shadow`），4–6 秒自动消失。
- 拖拽导入覆盖层：页面内缩 20px 的 2px 靛蓝虚线圆角框 + 靛蓝浅底 70%，中央靛蓝字提示。

### Empty States & Terminal

- 空状态：居中 emoji 字形（text-4xl）+ 一行 text-sm + 一行 Label 灰字说明。emoji 只在此处与走带键出现，是标点不是插画。
- 引擎日志终端：等宽 Micro 字号、终端黑底终端白字、8px 圆角、p-3——应用内唯一的大面积深色块，代表"引擎在说话"。

### Signature: 校对编辑器

全屏模态内左右分栏（原图对照 / alphaTex 文本），各占 50%、各带边框与迷你工具行；双向滚动同步、按小节跳转与光标小节指示（靛蓝字）。顶部有琥珀浅底的语法速查条。它是"透明可校对"原则的物理化身：原图与转录永远并排可见。

## Do's and Don'ts

### Do:

- **Do** 让靛蓝只出现在可点击的主动作、激活态与进度上；一个界面一个主按钮。
- **Do** 用 1px 描边灰 (#e4e4e7) 边框做一切静态分隔；卡片白底浮在纸面灰 (#f6f7f9) 上。
- **Do** 用状态 pill 模式（浅底 100 + 深字 700）表达识别流水线的四种状态。
- **Do** 把次要操作藏进悬停浮现（卡片操作组）与下拉菜单（导出），保持工具栏安静。
- **Do** 保持紧凑密度：text-sm 基准、py-1.5 控件内边距、16px 网格间距。
- **Do** 引擎/系统级的"技术黑盒"内容（日志、路径）用终端黑或代码灰块呈现。
- **Do** 键盘焦点用全局 `:focus-visible` 描边（#6366f1，2px，白底 4.5:1）表达——只对键盘导航出现，鼠标点击不显示；输入类控件仍以边框变色为准。
- **Do** 每个 icon-only 控件带 `aria-label`（与 title 同文）；悬停浮现的操作组必须同时响应 `group-focus-within`。
- **Do** 破坏性操作走确认模态 + 6 秒撤销 toast（软删除）；错误与日志文字必须可选中复制。
- **Do** 浏览器表面随系统主题化：细滚条（thumb #d4d4d8 内缩留轨缝）、输入光标主色（caret #4f46e5）、时间/百分比用 `tabular-nums` 等宽数字。
- **Do** 动效只做状态回应：按钮颜色 150ms、卡片悬停微抬（-2px）、模态/toast/菜单入场淡入上浮（150–180ms ease-out）、节拍器激活脉动 0.8s 循环；`prefers-reduced-motion` 下一律取消。

### Don't:

- **Don't** 使用渐变文字、玻璃拟态（backdrop-blur 面板）、发光阴影——已确认为反例。
- **Don't** 做 SaaS 仪表盘式的彩色统计卡/图表卡——这是琴房，不是后台。
- **Don't** 引入第二个强调色，或把状态色（琥珀/蓝/翡翠/红）当装饰用。
- **Don't** 给静止元素加阴影；阴影只回应悬停与浮层。
- **Don't** 给输入框 focus 加 ring 或光晕——边框变色到 #818cf8 就是全部。
- **Don't** 引入 webfont 或 400/600 之外的 regular 字重。
- **Don't** 把 emoji 当插画体系用——它只属于空状态字形与走带键。
- **Don't** 用 #a1a1aa 承载信息文字（白底 2.1:1，WCAG AA 失败）；信息文字下限 #71717a。
- **Don't** 使用 `window.confirm`/`alert`——wry/WKWebView 不实现，一律走确认模态。
