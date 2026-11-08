# AGENTS.md — ScanScore 开发注意事项

给 AI 编码代理 / 新成员的项目须知。全部来自本仓库实际踩过的坑，按模块整理。

## 项目速览

- Tauri 2 + React 19 + TS + Tailwind 4；Rust 侧模块见 `src-tauri/src/`（db/omr/vlm/import/mxl/pdf/tabdetect/backup）
- 常用命令：`npm run dev:app`（完整应用）、`npm run dev`（仅 Vite，浏览器预览，后端 API 不可用）、`cargo test`（在 src-tauri 下，12 个单测）、`cargo test --test omr_pipeline -- --ignored`（需本机装 Audiveris）
- 用户数据：`~/Library/Application Support/com.dsjerry.scan-score/`（library.db + scores/<id>/ + covers/），与 dev/release 共用
- 测试样例在 `samples/`（来自 Audiveris 官方仓库）；Audiveris 装在 `/Applications/Audiveris.app`

## 应用图标

- 图标源文件是 `public/app-icon.png`（1024×1024 RGBA PNG），侧栏和网页 favicon 共用它；参考 JPG 的圆角外黑底已移除，替换素材时必须保留真正的透明通道，不能只把黑底改成白底
- 修改后运行 `npm run icons`，通过 Tauri CLI 重新生成 `src-tauri/icons/` 中的 PNG、ICNS、ICO 和移动端资源；不要再用旧的 `src-tauri/examples/gen_icon.rs` 像素生成器
- 图标自带透明边距和圆角底板，应用内显示时不要再加背景或额外圆角裁切
- `tauri::generate_context!()` 在 macOS 开发模式下会将 ICNS 嵌入二进制，但不会自动监听原始图标文件；`build.rs` 必须保留 `cargo:rerun-if-changed=icons`，否则只改图标后 Cargo 会复用嵌着旧图标的程序，重启 `dev:app` 也不会更新

## alphaTab（渲染/播放）

- **包名是 `@coderline/alphatab`**——npm 上的 `alphatab` 不存在（404）
- **字体缺失 = 静默不渲染**：Bravura 找不到时只有控制台一行 `[AlphaTab][Font] Loading Failed, rendering cannot start`，API 不报错、无 SVG 输出。字体目录解析顺序：`window.ALPHATAB_FONT` → 脚本同目录 `font/`。我们设了 `window.ALPHATAB_FONT = "/font/"` 且字体在 `public/font/`（Vite 打包后 import.meta.url 不可靠，必须走全局变量）
- Vite 集成用官方插件 `@coderline/alphatab-vite`（devDep），自动处理 worker/worklet/字体
- **类型是 UMD 全局声明 + 命名空间导出**：`Track`/`Score` 在 `model` 命名空间，`PlayerState` 在 `synth`，`MidiFile/MidiFileGenerator/AlphaSynthMidiFileHandler` 在 `midi`；裸 `import { Track }` 会 TS2459。`LayoutMode`/`Settings`/`DisplaySettings` 是根导出
- 播放控制：seek 用 `api.player.tickPosition`（getter+setter，tick 单位）；A-B 循环 `api.player.playbackRange = { startTick, endTick }` + `isLooping`；变速/音量都在 `api.player.*`（api 上的同名属性是只读 getter）
- `playerPositionChanged` 事件同时给 ms（`currentTime`/`endTime`）和 tick，进度条用 ms、seek 用 tick
- `changeTrackMute(tracks: Track[], mute)` 接收**数组**；`display.scale` 是缩放（没有 zoom 字段）；改显示设置后要 `api.updateSettings(); api.render();`
- 音源：`public/soundfont/GeneralUser.sf2`（31MB，比默认 sonivox 好很多）；sonivox 保留作对比

## Audiveris（OMR）

- CLI 实测（5.11.0）：`Audiveris -batch -export -output <dir> <input.png|pdf>`，位置参数即可；每张图一个 book，**PDF 自带多 sheet**
- **jpackage dmg 自带 JRE**（Contents/runtime），无需系统 Java；dmg 挂载要 `yes | hdiutil attach`（AGPL 许可交互会卡住非交互调用）
- OCR 语言包在 `~/Library/Application Support/AudiverisLtd/audiveris/tessdata/`，**必须用 tessdata 主仓库的 legacy 版**——tessdata_best/fast（纯 LSTM）会报 "legacy engine requested" 且 OCR 静默失效（音符不受影响）
- **低分辨率图（谱线间距 < 12px）会被 "Sheet ignored" 拒绝导出 → 进程 exit 1**。导入/识别前用 sips 放大（`--resampleWidth`），见 `omr.rs::prepare_input`，目标宽度可在设置页调
- **重跑会覆盖同名 .mxl**——判断"本次是否有产出"必须用文件 mtime ≥ 运行开始时间，不能用前后文件集合 diff（我们在这栽过：重新识别误报"未能导出"）
- 六线谱（TAB）Audiveris 识别不了（官方限制）：谱线会检出但被忽略，产出几乎无音符的空谱。我们的对策：`tabdetect.rs` 行中位数法检测 6 线谱 → 直接走 VLM 转录
- Audiveris 的 `-playlist` 是把每张图当**独立乐章**（导出多个 .mxl、小节各自编号）——想"多张图连成一首"要用图片纵向拼接（`import.rs::concat_images`），别用 playlist

## 图像处理（macOS 内置工具，零外部依赖）

- `sips`：AVIF/WebP→PNG（`-s format png in --out out`，注意 **空格分隔不是 =**）、PDF 首页渲染封面、图片放大
- `mdls -name kMDItemNumberOfPages -raw x.pdf`：PDF 页数
- 谱线检测（tabdetect.rs）核心教训：**浅灰谱线（亮度~229）用暗像素计数/Otsu 都会漏**；改用「行中位数亮度显著低于背景」（谱线横贯整行 → 行中位数=线色；文字行中位数仍是白）——对深浅谱线通吃

## VLM 六线谱识别（vlm.rs）

- **推理型模型（如 deepseek-flash）默认会把输出预算全烧在思考上**：content 为空、finish_reason=length。解法按优先级：默认开推理 + max_tokens 32768（实测推理让转录完整度 +55%）；请求带 `thinking: {"type":"disabled"}` 作为降级档；严格端点 400 时自动去掉字段重试
- **长生成（~4 分钟）响应流会被网关掐断**（reqwest "error decoding response body"）——必须自动重试 3 次
- 实测对比数据（同一张 TAB）：推理关 4s/81 音符记号/半首 vs 推理开 234s/126 音符记号/整曲
- 协议是 OpenAI 兼容 chat/completions；各平台只差 Base URL；`GET /models` 拉模型列表部分平台不支持（DashScope 就没有），前端要留手动输入
- **测试 VLM 必须用程序同款输入**——曾因探针用原图、程序用放大图导致线上才暴露问题

## Tauri 平台坑

- **同步 command 跑在主线程**：`blocking_pick_files()` 之类会与 macOS 面板事件循环死锁（光标转菊花）→ 弹对话框/耗时操作的 command 必须 `async fn` + `spawn_blocking`
- `libc::kill` 只有 unix；Windows 终止进程用 `taskkill /PID <pid> /F` + `std::os::windows::process::CommandExt::creation_flags(0x08000000)`（要显式 use trait），存活探测用 `tasklist /FI`
- **Cargo.toml 里 `[target.'cfg(windows)'.dependencies]` 不能插在 [dependencies] 中间**——TOML 表会把后面的键吞进平台段（我们断送过 reqwest/base64 的 mac 编译）
- `tauri.conf.json` resources 的 glob 要 `resources/engine/**/*`（`**` 不匹配）；**资源落点层级有歧义**（编译期能过、运行时路径对不上）——运行时用多候选探测（`engine/`、`resources/engine/`、根），见 omr.rs resolve_engine
- macOS 打 dmg：tauri 的 bundle_dmg.sh 依赖 Finder AppleScript，自动化环境常超时（-1712）→ 手工 `hdiutil create -volname X -srcfolder <app> -format UDZO` 兜底
- 前端拖拽监听（`getCurrentWebview().onDragDropEvent`）在纯浏览器预览会抛异常——必须 try/catch 包住，否则 React 整树崩掉（白屏）
- **重复构建时报 `Permission denied (os error 13)`，日志停在 `TAURI_ENV_TARGET_TRIPLE` 后**：Tauri 复制 Audiveris/JRE 资源时保留 `0444` 权限，下次 `fs::copy` 无法覆盖生成副本。`build_support.rs` 在复制前仅为 Cargo 输出目录 `resources/engine` 内的普通文件补 owner-write，保留执行位、不跟随符号链接、不修改源码资源；不要只手动 chmod 一次（下次复制又会变只读）。回归测试：在 `src-tauri` 下运行 `cargo test --test build_resources`

## 发布流程

- 版本号存在三处：package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json（+ Cargo.lock）——**不要手改**，跑 `bash scripts/release.sh x.y.z`（校验工作区干净/远端不分叉/tag 不重复，push 失败自动走 7890 代理）
- tag 推送后 CI（.github/workflows/build.yml）自动构建双平台并创建 GitHub Release；release job 单独 `contents: write` 最小权限
- 项目 skill：`.zcode/skills/release/SKILL.md`（agent 触发 `/release x.y.z`）
- 实测：直连 GitHub 间歇失败，git push 走 `git -c http.proxy=http://127.0.0.1:7890 ...` 稳定

## Skill 位置

- ZCode 项目级 skill 读 `<repo>/.zcode/skills/` 与 `<repo>/.agents/skills/`（后者是跨工具标准，Claude/Copilot/Hermes 等也读），用户级在 `~/.agents/skills/`
- impeccable（前端设计规范 skill，v4.8）装在 `.agents/skills/impeccable/`（跨工具共享，单一来源）；`.github/` 下 Copilot 专属副本已移除——如需 Copilot 支持重跑 `npx impeccable install` 选 GitHub 目标
- 同名 skill 按发现顺序第一个生效：user .zcode → user .agents → workspace .zcode → workspace .agents → 插件

## 工作方式（用户明确要求过的）

- **修问题修根因**，不给出绕过性的答案（例：推理模型空输出，正确解是开推理+加预算+阶梯降级，不是一刀切关推理）
- **验证必须用程序实际运行的条件**，探针通过≠链路通过（例：探针用原图、程序用放大图，线上才暴露流中断）
- 报错信息要带具体原因（HTTP 状态码/finish_reason/引擎日志尾部），不允许只有退出码
- 网络差时的可用性排序：npm registry 稳定 > unpkg 稳定 > jsdelivr/raw.githubusercontent 间歇失败（重试循环 5-10 次通常能过）；本机代理可用（127.0.0.1:7890）
- python 脚本改文件后 shell cwd 可能变——命令一律用绝对路径或显式 cd
