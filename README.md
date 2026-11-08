<div align="center">
  <img src="public/app-icon.png" width="128" alt="ScanScore 图标" />
  <h1>ScanScore — 乐谱扫描与播放</h1>
</div>

桌面应用：导入乐谱 → 识别 → 曲库 → 浏览与播放。

- 📷 **扫描识别**：PNG / JPG / AVIF / WebP / PDF 五线谱，本地离线 OMR（Audiveris）；低清图片自动放大；识别参数可调
- 🎸 **六线谱（TAB）**：图像自动检测 → AI 视觉模型转录 alphaTex（可选，支持 DeepSeek/智谱/硅基流动/Ollama 等 OpenAI 兼容端点）；Guitar Pro 文件（.gp3–.gp5/.gpx）直接导入
- 🎼 **曲库**：SQLite 管理、封面、搜索筛选、文件夹批量导入、多图合并为一首、批量识别/删除、备份恢复
- ▶️ **播放**：WebAudio 合成器（GeneralUser GS 音源）、A-B 循环、节拍器、变速 0.5–2x、轨道静音、横向/分页布局、缩放
- 📤 **导出**：MIDI、MusicXML/alphaTex；alphaTex 编辑器（AI 结果人工校对）
- 🔍 **透明度**：每次识别的引擎日志可在界面查看
- 🔒 **隐私**：五线谱识别全程本地；仅 AI 六线谱转录（可选功能）需联网

## 技术栈

- **框架**：Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS
- **OMR 识别**：Audiveris 5.11（独立进程 CLI 批处理，输出 MusicXML/.mxl）
- **乐谱渲染与播放**：[alphaTab](https://alphatab.net)（SVG 渲染 + WebAudio 合成器）
- **PDF 处理**：macOS 用内置 `sips` / `mdls`（零外部依赖）；Windows（规划）用 pdfium + 随包动态库，见 `src-tauri/src/pdf.rs` 的平台隔离层
- **存储**：SQLite（rusqlite），数据目录 `~/Library/Application Support/com.dsjerry.scan-score/`

## 开发

```bash
npm install
npm run tauri dev     # 需要 Rust 工具链
cargo test            # 在 src-tauri 下跑 Rust 单测
```

### 环境变量（开发期）

| 变量 | 作用 |
|---|---|
| `AUDIVERIS_CMD` | Audiveris 启动器路径（如 `/Applications/Audiveris.app/Contents/MacOS/Audiveris`） |

也可在应用「设置」页里持久化配置（存 SQLite settings 表）。

### 测试样例

`samples/` 内含 Audiveris 官方示例（cucaracha.png、Dichterliebe01.pdf 等），
用于验证识别管线与播放链路。`spike/` 是 M0 技术验证页（alphaTab 渲染+播放，支持 `?file=` 参数）。

### 已验证的识别管线（2026-11-08, macOS ARM64）

- **Audiveris 5.11.0**（jpackage dmg 自带 JRE，无需系统 Java），安装到
  `/Applications/Audiveris.app`，CLI 实测命令：
  `Audiveris -batch -export -output <outDir> <input.png|pdf>` → 产出 `<name>.mxl`
- OCR 语言包（歌词/标题识别）放
  `~/Library/Application Support/AudiverisLtd/audiveris/tessdata/eng.traineddata`
- Audiveris 产出的 .mxl 经解包后 alphaTab 1.9 可直接渲染+播放（已实测）
- Rust 集成测试：`cargo test --test omr_pipeline -- --ignored`

## 架构

```
导入 (PDF/PNG/JPG/MusicXML/GP)
  ├─ MusicXML/GP → 直接入库 (ready)
  └─ PDF/PNG → 复制入库 → 识别任务队列(串行 worker)
        → Audiveris -batch -export → .mxl
        → 解包 → score.xml + 元数据 → (ready)
  → 曲库 (SQLite) → alphaTab 渲染 + 播放
```

关键代码：
- `src-tauri/src/omr.rs` — 引擎解析、批处理调用、任务队列与取消
- `src-tauri/src/db.rs` — 曲库数据层
- `src-tauri/src/commands.rs` — Tauri commands
- `src/components/ScoreViewer.tsx` — alphaTab 封装
- `src/pages/` — 曲库 / 详情 / 设置

## 许可说明

- 本项目代码：MIT
- Audiveris 为 AGPL-3.0，以独立进程方式调用；商用分发前请自行确认合规
- alphaTab 为 MIT

---

## English

**ScanScore** turns paper sheet music into playable, editable digital scores — a desktop app built with Tauri 2, Rust and React.

- 📷 **Scan**: offline OMR (Audiveris) for PNG / JPG / AVIF / WebP / PDF staff-notation scores, with automatic upscaling of low-resolution scans
- 🎸 **Tabs**: tablature images are transcribed to alphaTex by a vision model (optional, works with any OpenAI-compatible endpoint such as DeepSeek, ZhipuGLM or a local Ollama); Guitar Pro files (.gp3–.gp5 / .gpx) import natively with full tab rendering
- 🎼 **Library**: SQLite-backed catalog with covers, search & filters, folder import, merging multiple images into one piece, batch operations, backup & restore
- ▶️ **Play**: WebAudio synthesizer (GeneralUser GS soundfont), A-B loop, metronome, 0.5–2× speed, track mute, zoom and page/horizontal layouts
- 📤 **Export**: MIDI, MusicXML / alphaTex, plus a built-in alphaTex editor for proofreading AI transcriptions
- 🔍 **Transparency**: engine logs for every recognition are viewable in the app
- 🔒 **Privacy**: staff-notation recognition runs fully offline; only the optional AI TAB transcription uses the network

### Build

```bash
npm install
npm run dev:app     # run the desktop app in development
npm run build:app   # produce the macOS dmg
```

### Release

```bash
bash scripts/release.sh 0.2.0   # bumps versions, tags & pushes — CI builds the release
```

Engineering notes for agents and contributors: [AGENTS.md](AGENTS.md).
