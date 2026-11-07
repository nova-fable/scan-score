# ScanScore — 乐谱扫描与播放

桌面应用：导入 PDF/PNG 乐谱 → OMR 光学识别（Audiveris）→ 曲库管理 → 浏览与播放（alphaTab）。
支持钢琴谱、吉他五线谱扫描识别；吉他六线谱通过 Guitar Pro 文件（.gp3~.gp5/.gpx）直接导入。

## 技术栈

- **框架**：Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS
- **OMR 识别**：Audiveris 5.11（独立进程 CLI 批处理，输出 MusicXML/.mxl）
- **乐谱渲染与播放**：[alphaTab](https://alphatab.net)（SVG 渲染 + WebAudio 合成器）
- **PDF 光栅化**：pdfium-render（封面缩略图/页数）
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
| `PDFIUM_DYLIB` | pdfium 动态库路径（如 bblanchon/pdfium-binaries 的 `pdfium.dylib`） |

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
