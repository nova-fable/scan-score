# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

双支柱并重，两类核心受众平权：

- **器乐/古典学习者与教师**：手里有纸质五线谱或 PDF，需要把它数字化后跟练、校对、整理进曲库。
- **吉他手/现代乐手**：使用六线谱（TAB）、Guitar Pro 文件，需要识别或导入后配合 A-B 循环、变速练习。

共同场景：在桌面电脑上完成「拿到谱 → 变成可播放可改的数字谱 → 练习」的全程。当前发布形态为单人本地桌面应用，无多用户/协作场景。

## Product Purpose

ScanScore 把纸质乐谱、图片、PDF 和 Guitar Pro 文件变成可播放、可练习、可校对的数字曲谱：本地离线 OMR 识别五线谱、AI 视觉模型转录六线谱、SQLite 曲库管理、alphaTab 渲染与 WebAudio 播放、原图对照校对编辑器、MIDI/MusicXML/alphaTex 导出。成功意味着：一次导入就能得到准确可直接跟练的曲谱，且全程无需离开应用。

## Positioning

**扫描→播放→校对闭环**：从纸质谱到可练可改的数字谱，在一个桌面应用内完成，不需要在扫描工具、记谱软件、练习软件之间搬运。邻居产品（MuseScore/Guitar Pro 有编辑播放但无扫描闭环；forScore/Newzik 是曲库阅读器无 OMR；Audiveris 本体是 CLI 引擎）都无法同样宣称这条完整链路。本地识别/隐私是这条闭环上的默认属性，而非单独卖点。

## Operating Context

- 桌面应用：macOS (Apple Silicon) 正式可用，Windows 实验性；窗口 1280×820，最小 1000×640。
- 用户数据在本地（macOS：`~/Library/Application Support/com.dsjerry.scan-score/`：library.db + scores/ + covers/），与 dev/release 共用。
- 五线谱识别完全离线（内置 Audiveris 引擎与音源）；「AI 六线谱转录」是可选联网功能，用户在设置页自带 OpenAI 兼容端点的 API Key（支持 DeepSeek/智谱/硅基流动/Ollama 等）。
- 输入格式：PNG/JPG/AVIF/WebP/PDF（五线谱）、六线谱图像（自动检测后走 AI 转录）、MusicXML、.gp3–.gp5/.gpx。
- 识别参数（如低清图放大目标宽度）可在设置页调整；每次识别的引擎日志在界面可见。
- 开发/测试样例在 `samples/`（来自 Audiveris 官方仓库）。

## Capabilities and Constraints

已确认能力：五线谱 OMR（离线、批量、低清自动放大）、六线谱图像检测 + AI 转录 alphaTex、Guitar Pro/MusicXML 直导入、多图合并为一首、曲库（封面/搜索/状态与乐器筛选/批量操作/备份恢复）、播放（A-B 循环、节拍器、变速 0.5–2x、轨道静音、横向/分页、缩放）、校对编辑器（原图对照 + alphaTex 分栏、按小节定位滚动同步）、MIDI/MusicXML/alphaTex 导出、引擎日志透明化、基础键盘层（Space 播放暂停、←/→ ±5s seek、Esc 逐层退出、Enter 提交元数据、⌘F 聚焦搜索）、删除确认模态 + 30 秒软删除撤销、重识别覆盖已校对谱文前确认、校对编辑器脏草稿丢弃确认。

约束：六线谱是 Audiveris 官方不支持的，TAB 路线完全依赖 tabdetect 判据 + VLM，识别质量与模型/API 相关；低分辨率图（谱线间距 < 12px）必须先放大才能识别。

既定未实现：UI 文案 i18n（跟随系统中英双语）是明确目标，当前实现为硬编码简体中文、尚无 i18n 框架。未来 UI 改动应避免把中文文案焊死在难以抽取的位置。

## Brand Commitments

- 名称 **ScanScore**；应用图标 `public/app-icon.png`（1024×1024 RGBA，必须保留真正透明通道，替换后跑 `npm run icons`；应用内显示时不加背景或额外圆角）。
- UI 语言承诺：跟随系统双语（中/英）；当前文案语言为简体中文。
- 代码 MIT 开源（第三方：Audiveris AGPL-3.0 独立进程、alphaTab MIT、GeneralUser GS 音源）。
- README 双语互链（简体中文为主，README_EN.md 对应英文）。

## Evidence on Hand

- `samples/` 测试样例（Audiveris 官方仓库来源），可用于演示与回归。
- AGENTS.md 有实测工程数据（如 VLM 推理开关对转录完整度 +55%、识别时延对比），可作为设置页/文档的事实依据。
- 已发布 GitHub Releases（macOS dmg 未签名，Windows CI 构建中），安装指引在 README。
- **缺失声明**：无用户访谈、评价、案例、下载量数据——未来文案与 landing 工作不得虚构这些。

## Product Principles

1. **双支柱平权**：五线谱与六线谱在信息架构、导航与流程中是一等公民，UI 不把任一条线降格为「高级选项」或隐藏入口。
2. **闭环优先**：新能力优先缩短「纸质谱 → 可练可改」的链路；制造独立工具点而非闭环环节的功能要给出强理由。
3. **本地优先，联网显式**：核心识别离线；任何联网能力必须可选、用户自带凭据、界面明示。
4. **透明可校对**：系统做了什么（引擎日志、原图对照）用户都能看到并亲手修正，不隐藏中间状态。
5. **桌面级效率**：面向长时间练习与曲库整理的重度使用，批量操作与键盘/滚动流畅度是硬要求。
