---
name: ScanScore
description: 乐谱扫描与播放 — 一本摊开的 Real Book：墨绿书封承载壳，奶油纸承载工作区
colors:
  ink: "#1e4636" # 深墨绿油墨：主按钮、激活底、书封卡绿面、进度填充
  ink-deep: "#16312a" # 墨绿壳：侧栏底、toast 底、引擎日志终端
  ink-bright: "#2a5847" # 墨绿面 hover
  paper: "#f7f1de" # 奶油纸：工作区底
  paper-bright: "#fffdf4" # 亮纸：输入框、浮层面板、播放条
  paper-dim: "#e9dfc4" # 纸凹槽：hover 底、代码块、对照层
  bind: "#1c2420" # 雕版黑：纸上全部文字、纸上焦点环、光标
  gold: "#c7a94e" # 烫金：品牌双细线、壳上焦点环、A-B 金标、toast 动作词
  spot-ok: "#17684a" # 专色·可播放
  spot-run: "#2a5580" # 专色·识别中
  spot-fail: "#a83324" # 专色·识别失败/危险
  spot-wait: "#8a5a1c" # 专色·待识别/警示/节拍器
  hair: "#ddd3b8" # 纸上细线：默认分隔
  hair-strong: "#b9ad8a" # 纸上重细线：输入框与次级按钮边、滚条 thumb
  ink-faint: "rgba(247, 241, 222, 0.72)" # 壳上次级文字（奶油 72%）
  selection-gold-tint: "#e3d7a8" # 选区烫金浅印
typography:
  display:
    fontFamily: "Bitter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 900
    lineHeight: 1.25
  headline:
    fontFamily: "Bitter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 900
    lineHeight: 1.4
  subheadline:
    fontFamily: "Bitter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.34
rounded:
  sm: "2px" # 卡内封面图版
  md: "6px" # 多选框、卡上悬浮小操作、kbd、A/B 端点半块
  lg: "8px" # 控件主力：按钮、输入框、书封卡、导航项、菜单、toast
  xl: "12px" # 模态面板
  full: "9999px" # 状态贴纸、走带圆钮、进度轨、队列角标
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "600 0.875rem"
    rounded: "{rounded.lg}"
    padding: "6px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-bright}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "rgba(28, 36, 32, 0.8)"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-dim}"
  button-danger-confirm:
    backgroundColor: "{colors.spot-fail}"
    textColor: "{colors.paper-bright}"
    typography: "600 0.875rem"
    rounded: "{rounded.lg}"
    padding: "6px 16px"
  book-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "16px"
  book-card-paper:
    backgroundColor: "{colors.paper-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  status-sticker:
    backgroundColor: "{colors.spot-ok}"
    textColor: "{colors.paper}"
    typography: "700 11px"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  sidebar-nav-active:
    backgroundColor: "rgba(247, 241, 222, 0.15)"
    textColor: "{colors.paper}"
    typography: "600 0.875rem"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  input-field:
    backgroundColor: "{colors.paper-bright}"
    textColor: "{colors.bind}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  toast:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
---

# Design System: ScanScore

## Overview

**Creative North Star: "一本摊开的 Real Book" (The Open Real Book)**

ScanScore 是一本摊开的 Real Book：**封面文化**（深墨绿油墨 + 奶油纸、粗壮书封排印、烫金压线）承载壳——侧栏、主动作、状态贴纸；**内页文化**（干净纸面排印）承载工作区——校对、练习、设置。界面物质是印刷品：曲库是一排绿/奶油交替的迷你书封，状态是封面上 -2° 微旋的专色标签，引擎日志是墨绿终端里"引擎在说话"。识别流水线全程透明（引擎日志、原图对照、进度百分比都可读可复制），这是产品原则在视觉上的直接投影。

气质调性是**实物感**与**排印感**：紧凑桌面密度（无响应式断点，窗口最小 1000×640），深度是"印刷品放在桌上"的深度——书封静置有落影、悬停被拿起，而不是软件景深。两种底色构成整个世界：屏幕要么是墨绿壳，要么是奶油纸面，永不混入第三种灰。

明确反例（confirmed anti-reference）：「中性灰 + 单一强调色」的通用桌面工具品类默认（旧视觉世界已整体退役，zinc/indigo 时代的白卡、灰边、靛蓝一律不再出现）；以及渐变文字、玻璃拟态（backdrop-blur）、硬偏移阴影、unicode 字形/emoji 充当图标。

**Key Characteristics:**
- 一屏一种底：墨绿壳或奶油纸，永不混灰
- 状态是纸上的专色贴纸，不是调色盘口味
- 全应用只有一条时间轴（播放条校准轨：进度、A-B 金标、小节刻度同轨）
- 烫金稀缺：品牌双细线 / 壳上焦点环 / A-B 金标 / toast 动作词
- 图标是自绘 SVG 体系（24 viewBox、1.8 描边、currentColor），字形与 emoji 不是图标
- 字重纪律 400/600/700/900，禁 500；Bitter 只服务拉丁展示层
- 全局 tabular-nums；错误/日志/输入内容可选中复制

## Colors

调色是「两种纸感底色 + 一套油墨专色」：墨绿是壳与行动，奶油纸是页，状态四色是贴在封面上的专色，烫金是仪式性稀缺色——没有任何灰。

### Primary

- **深墨绿油墨 / Ink** (#1e4636, oklch(36% 0.0537 165.1)): 行动色。主按钮（导入乐谱、开始识别、保存）、播放键、进度填充、书封卡绿面、轨道 chip 激活底。墨绿亮起 = 可行动/已激活。
- **墨绿壳 / Ink-Deep** (#16312a, oklch(28.9% 0.0358 174.8)): 侧栏壳底、toast 底、引擎日志终端底。大面积深色块只属于"封面"与"系统在说话"两个身份。
- **墨绿·亮 / Ink-Bright** (#2a5847): 墨绿面（按钮、壳上导航）的 hover。

### Secondary

- **烫金 / Gold** (#c7a94e, oklch(74.3% 0.1155 91.1)): 见 The Gold Scarcity Rule——品牌双细线（侧栏扉、设置扉）、墨绿壳上的键盘焦点环、校准轨 A-B 金标、toast 动作词、侧栏快捷键提示。
- **烫金浅印 / Selection Tint** (#e3d7a8): 全局 `::selection` 底色，不暴露浏览器默认蓝。

### Tertiary（纸上专色）

- **专色·可播放 / Spot Emerald** (#17684a): ready 状态贴纸、成功反馈文字、"已找到 ✓"。
- **专色·识别中 / Spot Blue** (#2a5580): processing 贴纸、卡片进度条填充、队列角标（15% 淡印底 + 全色字）。
- **专色·识别失败 / Spot Red** (#a83324): failed 贴纸、危险动作（删除文字、危险确认键实心底）、错误信息。
- **专色·待识别 / Spot Amber** (#8a5a1c): imported 贴纸、警示按钮（从备份恢复）、节拍器激活态、alphaTex 语法速查条。

四个专色全部深到能直接承载奶油字（#f7f1de 文字在四个专色底上均达 WCAG AA）——设计草案的浅值（#1e8756/#2e5e8c/#a8382c/#a66b14）因此在构建时压深，以上为交付值。

### Neutral

- **奶油纸 / Paper** (#f7f1de, oklch(95.8% 0.0259 92.4)): 工作区底，body 背景即它。
- **亮纸 / Paper-Bright** (#fffdf4): 输入框、浮层面板、播放条、卡上悬浮小按钮——"更近读者"的纸。
- **纸凹槽 / Paper-Dim** (#e9dfc4): hover 底、代码块底、原图对照层底、kbd 底。
- **雕版黑 / Bind** (#1c2420, oklch(25.1% 0.0137 163.6)): 纸上全部正文与标题（body 继承色）、纸上键盘焦点环、输入光标。次级文字用透明度阶梯（bind/60 说明、bind/45 占位、bind/40 静默图标）。
- **纸上细线 / Hair** (#ddd3b8): 1px 默认分隔——页头下缘、Row 分节、菜单分隔。
- **重细线 / Hair-Strong** (#b9ad8a): 输入框与次级按钮边框、翻页小按钮边、滚条 thumb（hover 加深至 #8a7f5e）。
- **壳上奶油 / Ink-Faint** (rgba(247, 241, 222, 0.72)): 墨绿壳上的次级文字——导航未激活、署名行。壳上不引入任何灰阶。

### Named Rules

**The Two-Tone Rule.** 一屏只有一种底：墨绿壳或奶油纸。ink 家族承担壳与行动，paper 家族承担工作区；深色条（toast、引擎终端）是壳向纸面的探出，不是第三种底色。屏幕上不允许出现中性灰——灰是旧世界的化石。

**The Spot-Color Rule.** 状态四色只表达识别流水线状态、危险与警示，以贴纸/文字/进度出现，永不作装饰、图表或氛围色。专色底上直接放奶油字（选值按 AA 校准）；淡印形态只允许"15–20% 专色底 + 全色字"这一种。

**The Gold Scarcity Rule.** 烫金只给四处：品牌双细线、墨绿壳上的键盘焦点环、校准轨 A-B 金标、toast 动作词。金出现 = 仪式或壳上导航；一个界面需要第五处金时，先怀疑设计。

## Typography

**Display Font:** Bitter 700/900（拉丁书封展示体，@fontsource 本地打包，离线约束）+ 中文自动回落系统黑体
**Body/UI Font:** 系统栈 `-apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif`
**Editor/Mono Font:** 系统等宽栈（`font-mono`，校对编辑器 alphaTex 文本）

**Character:** 封面用粗壮衬线喊出标题，内页用安静的系统黑体做工——一个世界的两种声音。Bitter 只覆盖拉丁字母与数字，中文字符落到 PingFang SC/微软雅黑，所以"书封感"只属于英文/数字；中文标题在同一行内以黑体字重参与同一排印层级。

### Hierarchy

- **Display** (Bitter 900, 21px, line-height 1.25): 品牌字「ScanScore」与无封面排印封面标题（line-clamp-3 居中）。
- **Headline** (Bitter 900, 20px): 页面题名（曲库 / 设置）。详情页曲名同族 18px（单行截断）。
- **Subheadline** (Bitter 700, 16px): 模态标题（校对编辑器、引擎日志、快捷键）。
- **Title** (600, 14px): 组件标题——设置 Row 标签、确认模态标题、按钮强调字、导航项。
- **Body** (400, 14px): UI 正文、按钮文字、输入框、下拉菜单项。
- **Label** (400, 12px): 提示、说明、轨道 chip、队列角标、翻页控件。
- **Micro** (400, 11px/1.34): 等宽/数字语境——播放时间、缩放百分比、引擎日志、alphaTex 速查条；与全局 tabular-nums 配套。
- **封面细节层**: 作曲者行（700, 11px, 字距 0.18em）、书脊信息行（400, 11.5px, 宽字距, 80% 不透明度）——书封排印的小字仪式。

### Named Rules

**The Two-Script Rule.** Bitter 是拉丁展示体，只进 700/900 两档的标题层；中文一律系统黑体。禁 500 字重（`font-medium`）——微软雅黑没有 500，会静默回落吃掉强调。micro(11px/1.34) 只进等宽与数字语境，散文说明用 label(12px)。

## Layout

固定桌面骨架：左侧 **224px 墨绿侧栏**（px-5：品牌锁定区 → 烫金双细线 → 导航（纵向 gap 6px）→ 底部引擎署名），右侧主列左缘一道**书脊装订内阴影**（`inset 12px 0 16px -12px rgba(28,36,32,0.4)`）——"摊开的书"。窗口最小 1000×640，无响应式断点。

- **页头工具栏**: 每页顶部 `px-5 py-3`、下缘 1px 纸上细线，**按功能分簇**——曲库页为「书架题名（Bitter 题名 + 册数）/ 筛选簇（搜索+乐器+状态+排序，内距 8px）/ 批量簇（独立重细线容器）/ 导入簇」，簇间 16px；批量簇出现时其余主动作降级为 hairline 形态；主按钮永远在最右。详情页头部三锚点：识别主按钮独立最右，次级簇（原图/导出/⋯，内距 8px）在其左。
- **曲库网格**: `repeat(auto-fill, minmax(210px, 1fr))`，间距 16px，内容区 p-5。
- **设置页 = 书末附录**: `max-w-2xl` 单列、p-6，细线分节（Row：`border-b hair py-5`，标签 + 灰注 + 内容），**无卡片**；扉部有烫金双细线与侧栏呼应。
- **详情页**: 上（alphaTab 查看器，占满剩余高）/ 下（播放条）垂直切分；原图对照层从底部推入（max-h 40%）；视图控制簇（缩放/滚动方向）悬浮查看器右上角。
- **z 序**: 卡上悬浮件 z-10 → 菜单 z-20 → 模态 z-30 → toast/确认模态 z-40。

## Elevation & Depth

深度是"印刷品放在桌上"：书封卡是静物，静止就带一点落影，hover 时被拿起来。其余表面静止时无影，阴影只给"物"与"浮层"。结构深度不用投影表达：书脊装订是内阴影（材质），引擎终端是墨绿深底（明度），专色贴纸的 -2° 微旋是"贴上去"（工艺）——都是印刷语义，不是软件景深。

### Shadow Vocabulary

- **book-rest** (`0 2px 6px rgba(28,36,32,0.2)`；奶油面 `0 2px 8px rgba(28,36,32,0.14)`): 书封卡静置落影。
- **book-lift** (`0 18px 32px rgba(28,36,32,0.35)`): hover 拿起一本书（配 `-8px` 上浮 + `-0.5°` 微旋）。
- **spine-binding** (`inset 12px 0 16px -12px rgba(28,36,32,0.4)`): 主区左缘装订——结构，非投影。
- **floating** (`0 1px 2px rgba(0,0,0,0.05)`): 卡上悬浮小按钮、主按钮微影。
- **dropdown** (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): 下拉菜单、toast。
- **modal** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): 模态面板，配 `rgba(0,0,0,0.3–0.4)` 遮罩。

### Named Rules

**The Object-on-a-Desk Rule.** 书封卡是桌上的静物：静置有落影、悬停被拿起。其余表面静止时完全无影；阴影只回应"物"与"浮层"。禁止硬偏移阴影（neobrutalist 平移影）。

## Shapes

圆角是"印刷裁切"不是"软件圆角"：**md 6px**（多选框、卡上悬浮小操作、kbd、A/B 端点半块）、**lg 8px**（绝对主力：所有按钮、输入框、书封卡、导航项、菜单、toast）、**xl 12px**（模态面板）、**sm 2px**（卡内封面图版）、**full**（状态贴纸、走带圆钮、进度轨、队列角标）。边框语言是排印语言：1px 纸上细线做一切默认分隔；奶油面书封卡用 **1.5px** 墨绿边（更厚的封面纸）；拖拽覆盖层是 2px 墨绿虚线。**双细线（double rule）是品牌署名**：侧栏与设置扉用 `4px double` 烫金 45%，封面仪式框（.cover-rule）上 `3px double` + 下 `1px solid`。

### Named Rules

**The Double-Rule Signature.** 双细线只属于品牌时刻：壳扉、设置扉、封面排印框。单细线是工作语汇，双细线是仪式语汇——不要把 double rule 拿去做普通分隔。

## Components

### Buttons

- **Shape:** 8px 圆角（lg），高度由 text-sm + py-1.5 决定（约 30px）。
- **Primary:** 墨绿实心 (#1e4636) + 奶油字（600 字重——墨绿已承担强调），px-3/4 py-1.5；hover #2a5847；禁用 `opacity-50`。每屏主动作至多一个；批量模式出现时导入按钮降级为 hairline 形态。
- **Secondary:** 透明底 + 重细线边 (#b9ad8a) + bind/80 字，hover 纸凹槽底。工具栏默认形态。
- **On-ink（壳上）:** 导航激活 = 奶油 15% 底 + 左缘 3px 奶油内条（inset shadow）+ 奶油字；未激活 = ink-faint 字 + hover 墨绿亮底。
- **Destructive:** 确认模态实心键 = 专色红底 (#a83324) + paper-bright 字 + hover `brightness-95`；行内危险 = 红字 + 红 40% 边 + hover 红 10% 底。危险永不使用墨绿。
- **Warning:** 专色琥珀 10% 底 + 50% 边 + 琥珀字（从备份恢复——覆盖性操作）。
- 全按钮统一 0.15s `cubic-bezier(0.4,0,0.2,1)` 颜色过渡。

### Status Sticker（状态贴纸）

- 封面右上角 **-2° 微旋**的专色圆片：`rounded-full px-2.5 py-0.5`，11px/700，专色底 + 奶油字——待识别 #8a5a1c / 识别中 #2a5580 / 可播放 #17684a / 识别失败 #a83324。
- 识别中贴纸带实时百分比（「识别中 62%」）；曲库页头的队列角标是同族淡印形态（专色蓝 15% 底 + 全色字，rounded-full）。识别中卡片底部另有 5px 进度条（rgba(28,36,32,0.12) 轨 + 专色蓝填充，宽度下限 4%）。

### Cards / Containers（书封卡）

- **Corner Style:** 8px（lg）。
- **Background:** 两种面按网格索引奇偶交替——绿面 = 墨绿底 + 奶油字 + 奶油 50% 细线变量；奶油面 = paper-bright 底 + 墨绿字 + **1.5px 墨绿 55% 边** + 墨绿 45% 细线变量。
- **封面结构:** cover-rule 仪式框（上 3px double + 下 1px solid，内放 21px Bitter 900 标题，line-clamp-3）→ 作曲者行（11px 700 字距 0.18em）；有封面图时改为 15px 标题带（line-clamp-1）+ h-36 图版（2px 圆角，object-cover）。
- **书脊信息行:** 底部上细线 + 11.5px 居中一行——作曲者 · 乐器 · 来源 · 页数，80% 不透明度。
- **签名动作:** hover 上浮 -8px、微旋 -0.5°、落影加深，同时右缘 8px **页缘条**淡入（`repeating-linear-gradient` 奶油/纸纹 3px+1.5px 竖纹、1px 墨绿 50% 边、上下内缩 12px）——"开书"的暗示。
- **状态层:** 左上多选框（24px，checked = 奶油底墨绿勾；未勾 = 细线变量描边透明字，`group-focus-within` 与 hover 显形）；右上状态贴纸；识别中进度条；错误一行 12px 专色红字（可复制）；右下悬停浮现操作片（paper-bright 95% 底、6px 圆角，删除片专色红字，`group-hover` + `group-focus-within` 双通道）。
- **provisional:** 15px 标题带与书脊信息行在最小窗宽下的换行/截断行为未经实测——此层几何按临时处理，不要据此立规。

### Inputs / Fields

- **Style:** 亮纸底 (#fffdf4) + 1px 重细线边 (#b9ad8a) + 8px 圆角 + px-3 py-1.5 + text-sm；placeholder bind/45；无内阴影。
- **Focus:** 边框变墨绿 (#1e4636)——仅此而已。输入类禁用全局 `:focus-visible` 环（`outline: none`），键盘鼠标统一为边框语言；光标色雕版黑。
- **变体:** 组合框输入+▾ 连体（右侧块去左边框）；等宽小输入（小节跳转）右对齐 w-14。校对编辑器 textarea 无边框、等宽 12px/16px 行高。

### Navigation

- **侧栏（墨绿壳）:** 品牌锁定（36px 图标 + 21px Bitter 900 + 10.5px/0.3em 字距署名行）→ `4px double` 烫金 45% 分隔 → 导航项（text-sm 600、`rounded-lg px-3.5 py-2.5`、左对齐；激活 = 奶油 15% 底 + 左缘奶油条；未激活 = ink-faint + hover 墨绿亮底）→ 底部引擎署名（10.5px，OMR: Audiveris · alphaTab）+ 快捷键入口（hover 变金，`?` 常年金）。
- **纸上页头:** 返回按钮与 Secondary 同形；下拉菜单 w-44、亮纸底、hair 边、8px 圆角、shadow-lg、py-1，项为 px-3 py-1.5 text-sm hover 纸凹槽底，危险项专色红字；激活/展开态按钮 = 墨绿 50% 边 + 10% 底 + 600 字重。

### Transport — 校准轨（签名组件）

- **播放条:** 亮纸底、上缘 1px 细线、px-4 py-2。
- **走带钮:** 播放 = 36px 墨绿实心圆（14px filled 图标）；停止/循环/节拍器 = 32px hairline 圆；激活 toggle = 墨绿 60% 边 + 10% 底 + 墨绿字。A/B 是连体半块（w-7，`rounded-l-md`/`rounded-r-md`），激活后出现清除键（hover 转红系）。
- **校准轨（全应用唯一时间轴）:** h-2 圆角轨 `rgba(28,36,32,0.14)` + 墨绿填充，点击 seek、方向键 ±5s（`role="slider"`）；A-B 激活时轨上方悬 **5px 烫金排练括弧**（两端 9px 端点刻度）；轨下 5px **小节刻度行**（1px `bind/30`，每 5 根加高，>44 根自动抽稀）；时间 text-micro 居中（tabular-nums）。进度、A-B、小节刻度同轨注册——这是练习者的"谱面坐标系"。
- **节拍器激活态:** 专色琥珀字/边/底 + 0.8s 脉动光环（`anim-beat`，`prefers-reduced-motion` 下静止）——专色在走带上的唯一席位。
- **轨道 chip:** 6px 圆角小块；激活 = 墨绿 50% 边 + 10% 底 + 墨绿字；静音 = hair 边 + bind/40 + 删除线。

#### Named Rules

**The One Calibrated Rail Rule.** 播放条的时间轨是全应用唯一的时间轴：播放进度、A-B 烫金排练括弧、小节刻度全部注册在同一条轨上。任何页面不得另建时间/进度轴——需要表达时间时，把它带到这条轨上来。

### Modals & Overlays

- **模态:** `rgba(0,0,0,0.3–0.4)` 全屏遮罩 + 亮纸面板，hair 边、12px 圆角、shadow-xl、p-4/p-5。宽度档：420px（确认 / 文件夹导入）/ 480px（快捷键）/ 720px（日志）/ 1100px（校对编辑器，88% 高）。全部带 `role="dialog"` + 焦点陷阱 + Esc 关闭；入场 = 遮罩 150ms 淡入 + 面板 180ms 上浮（8px + 0.98 缩放）；`prefers-reduced-motion` 全免。承载输入/确认的模态不响应点遮罩关闭。
- **确认模态（420px）:** 一切破坏性操作的唯一守卫（`window.confirm` 在 wry 中不可用，禁用）——标题 + 后果说明 + 专色红实心确认键 + 取消；配合 30 秒软删除撤销 toast。
- **Toast:** 底部居中墨绿壳条（#16312a、奶油字、8px 圆角、shadow-lg），2–8s 按内容长度定、悬停暂停计时；**动作词是烫金字**（hover brightness-110）——撤销动词的专属颜色。
- **拖拽导入覆盖层:** 页内缩 20px 的 2px 墨绿虚线 12px 圆角框 + 亮纸 75% 底，中央墨绿字。
- **引擎日志终端:** 墨绿壳底 (#16312a) + 奶油 90% 等宽 micro 字、8px 圆角——应用内唯一的大面积深色块，代表"引擎在说话"；日志可选中复制。

### Empty States（排印插画）

- 空谱台 monument：240×130 手绘 SVG（五线谱 + 全休止符 + 四分音符：谱线 #b9ad8a 1.5px、网格线 #e3dab8 1px、符号墨绿实心）——体系内唯一的展示字形，配一句 14px + 一句 12px bind/55 + 墨绿主按钮。
- 同族小图贯穿全应用：筛选无结果（150×90）、识别中（进度在 SVG 内以专色蓝矩形生长）、未识别（120×100 纸页线稿）。emoji/unicode 字形不充当插画。

### Signature: 校对编辑器

1100px 全屏模态左右分栏（原图对照 / alphaTex 文本）各占 50%、各带 hair 边（原图侧纸凹槽 50% 底）；双向滚动同步（可关）、按小节跳转 + 光标小节指示（墨绿字）；顶部专色琥珀 10% 底的语法速查条（text-micro 琥珀字）；脏草稿关闭前确认、保存失败带原因。它是"透明可校对"原则的物理化身：原图与转录永远并排可见。

## Do's and Don'ts

### Do:

- **Do** 一屏一种底：墨绿壳或奶油纸；主动作 = 墨绿实心，每屏至多一个（The Two-Tone Rule）。
- **Do** 状态用专色贴纸/文字/进度表达，专色底上放奶油字；淡印只允许"15–20% 专色底 + 全色字"（The Spot-Color Rule）。
- **Do** 时间、进度、刻度全部注册到播放条校准轨（The One Calibrated Rail Rule）。
- **Do** 烫金只给品牌双细线、壳上焦点环、A-B 金标、toast 动作词（The Gold Scarcity Rule）。
- **Do** 图标走 SVG 体系（24 viewBox、1.8 描边、round cap/join、currentColor；走带键用 filled 族），每个 icon-only 控件带 `aria-label`。
- **Do** 焦点分两支：全局 `:focus-visible` 环（纸上雕版黑 2px / 壳上烫金 2px，offset 1px），输入类以边框变墨绿表达。
- **Do** 时间/计数用 `tabular-nums`（body 级全局设置）；错误消息、引擎日志、输入内容可选中复制。
- **Do** 动效只做状态回应：0.15s 颜色过渡、150ms 遮罩淡入、180ms 面板上浮、0.8s 节拍脉动；`prefers-reduced-motion` 下一律取消（含书封 hover）。
- **Do** 破坏性操作走 ConfirmDialog + 30 秒撤销 toast；错误必须带具体原因。
- **Do** 浏览器表面随世界主题化：选区烫金浅印 #e3d7a8、光标雕版黑、滚条 thumb 重细线（内缩 3px 留轨缝、9999px 圆角、hover #8a7f5e）。

### Don't:

- **Don't** 把旧世界带回来：中性灰底、白卡、靛蓝强调、灰 hairline（#e4e4e7 系）——「中性灰 + 单一强调色」的桌面品类默认是本世界的反例。
- **Don't** 引入第五种专色，或把状态色当装饰、图表、氛围用。
- **Don't** 用 unicode 字形/emoji 当图标或插画——SVG 图标体系是唯一图标来源（空态插画也是手绘 SVG）。
- **Don't** 使用 500 字重（`font-medium`）或 webfont 服务——Bitter 本地打包，中文回落系统栈。
- **Don't** 给输入框 focus 加 ring、光晕或阴影——边框变墨绿就是全部。
- **Don't** 使用硬偏移阴影、渐变文字、玻璃拟态（backdrop-blur 面板）。
- **Don't** 在墨绿壳上放雕版黑/纸面灰阶文字——壳上次级文字只用 ink-faint（奶油 72%）。
- **Don't** 使用 `window.confirm`/`alert`——wry/WKWebView 不实现，一切确认走 ConfirmDialog。
- **Don't** 建第二条时间轴——进度/循环/刻度只在播放条校准轨上出现。
- **Don't** 把 double rule 拿去做普通分隔——单细线是工作语汇，双细线是仪式语汇。
