<div align="center">
  <img src="public/app-icon.png" width="128" alt="ScanScore 图标" />
  <h1>ScanScore — 乐谱扫描与播放</h1>
  <p>把纸质乐谱变成可播放、可练习、可校对的数字曲谱</p>
  <p><b>简体中文</b> · <a href="README_EN.md">English</a></p>
</div>

---

## ✨ 功能

- 📷 **扫描识别**：PNG / JPG / AVIF / WebP / PDF 五线谱，本地离线 OMR（Audiveris）；低清图片自动放大；识别参数可调
- 🎸 **六线谱（TAB）**：图像自动检测 → AI 视觉模型转录 alphaTex（可选，支持 DeepSeek / 智谱 / 硅基流动 / Ollama 等 OpenAI 兼容端点）；Guitar Pro 文件（.gp3–.gp5 / .gpx）直接导入
- ✏️ **校对编辑器**：原图对照 + alphaTex 左右分栏、按小节定位与滚动同步，AI 结果人工精修
- 🎼 **曲库**：SQLite 管理、封面、搜索筛选、文件夹批量导入、多图合并为一首、批量识别 / 删除、备份恢复
- ▶️ **播放**：WebAudio 合成器（GeneralUser GS 音源）、A-B 循环、节拍器、变速 0.5–2x、轨道静音、横向 / 分页布局、缩放
- 📤 **导出**：MIDI、MusicXML / alphaTex
- 🔍 **透明度**：每次识别的引擎日志可在界面查看
- 🔒 **隐私**：五线谱识别全程本地；仅 AI 六线谱转录（可选功能）需联网

## 📦 下载安装

从 [Releases](https://github.com/nova-fable/scan-score/releases) 下载对应平台安装包：

| 平台 | 文件 | 状态 |
|---|---|---|
| macOS (Apple Silicon) | `ScanScore_x.y.z_aarch64.dmg` | ✅ 可用（未签名，首次右键 → 打开） |
| Windows | `*.msi` / `*.exe` | 🧪 实验性（CI 构建中） |

应用内含 Audiveris 引擎与音源，五线谱识别完全离线；只有「AI 六线谱转录」为可选联网功能（需在设置页填入自己的模型 API Key）。

## 🚀 开发

```bash
npm install
npm run dev:app     # 运行桌面应用（开发模式）
npm run build:app   # 构建正式安装包
cargo test          # Rust 单测（在 src-tauri 下执行）
```

需要 Rust 工具链与 Node.js 20+。

### 环境变量（开发期）

| 变量 | 作用 |
|---|---|
| `AUDIVERIS_CMD` | Audiveris 启动器路径覆盖（如 `/Applications/Audiveris.app/Contents/MacOS/Audiveris`） |

也可在应用「设置」页持久化配置（存 SQLite settings 表）。

### 发布

版本号分布在三处（package.json / Cargo.toml / tauri.conf.json），**不要手改**：

```bash
bash scripts/release.sh 0.3.0   # 统一改版本号 → 打 tag → 推送 → CI 自动构建 Release
```

也可在 agent 会话中使用 `/release 0.3.0`（项目 skill）。流程细节见 [AGENTS.md](AGENTS.md)。

## 🏗 架构

```
导入 (PDF/PNG/JPG/AVIF/WebP/MusicXML/GP)
  ├─ MusicXML / GP ──────────────→ 直接入库 (ready)
  ├─ 六线谱图像 (tabdetect 检出) → AI 转录 alphaTex → (ready)
  └─ 五线谱 PDF/图片 → 复制入库 → 识别任务队列(串行 worker)
        → Audiveris -batch -export → .mxl → 解包 → score.xml + 元数据 → (ready)
  → 曲库 (SQLite) → alphaTab 渲染 + WebAudio 播放
```

关键代码：

| 模块 | 职责 |
|---|---|
| `src-tauri/src/omr.rs` | 引擎解析、批处理调用、任务队列与取消 |
| `src-tauri/src/vlm.rs` | AI 六线谱转录（OpenAI 兼容协议、推理阶梯、重试） |
| `src-tauri/src/tabdetect.rs` | 六线谱图像判据（行中位数亮度法） |
| `src-tauri/src/import.rs` | 文件夹导入、多图纵向拼接、自然排序 |
| `src-tauri/src/db.rs` | 曲库数据层（SQLite） |
| `src-tauri/src/commands.rs` | Tauri commands |
| `src/components/ScoreViewer.tsx` | alphaTab 封装 |
| `src/pages/` | 曲库 / 详情（查看播放+校对编辑器）/ 设置 |

更多工程细节与踩坑笔记：[AGENTS.md](AGENTS.md)。

## 🤝 贡献

Issue 与 PR 均欢迎——提交前请读[贡献指南](CONTRIBUTING.md)与 [AGENTS.md](AGENTS.md)（工程踩坑笔记）。

## 📄 许可

- 本项目代码：[MIT](LICENSE)
- [Audiveris](https://github.com/Audiveris/audiveris)：AGPL-3.0，以独立进程方式调用；商用分发前请自行确认合规
- [alphaTab](https://alphatab.net)：MIT
- 音源：GeneralUser GS（S. Christian Collins，免费分发）· SONiVOX EAS（Apache-2.0）
