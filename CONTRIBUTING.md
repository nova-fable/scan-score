# 贡献指南

感谢关注 ScanScore！提交前请先阅读 [AGENTS.md](AGENTS.md)——里面是这个项目踩过的全部坑（alphaTab 静默失败、Audiveris 平台差异、Tauri 主线程死锁等），能帮你少走弯路。

## 环境准备

- Rust 工具链（rustup）+ Node.js 20+
- `npm install`
- （可选，识别开发）安装 [Audiveris](https://github.com/Audiveris/audiveris/releases) 到 `/Applications`，OCR 语言包见仓库 README

## 开发工作流

```bash
git checkout -b feat/你的特性名
npm run dev:app      # 开发调试
npm run build:app    # 验证可构建
```

提交前必须全部通过：

```bash
cd src-tauri && cargo test   # Rust 单测（当前 12 个）+ 构建回归测试（6 个）
npx tsc --noEmit             # 前端类型检查
```

新功能请附带测试：数据层/识别逻辑用 Rust 单测（参考 `tabdetect.rs` 的合成图测试写法）。

### 提交信息

沿用仓库现有风格：`模块: 中文描述`，一个 commit 一件事。例：

```
vlm: 请求失败自动重试3次
tabdetect: 修正浅灰谱线的阈值策略
```

## 反馈识别质量问题

识别相关的 issue 请附上：

1. 「详情页 → 日志」里导出的引擎日志（Audiveris 与 AI 转录都会记录）
2. 原始乐谱图片（或同类质量的替代样例）
3. 预期与实际差异的描述

**已知边界**（提交前先确认不是这些）：手写谱、六线谱的节奏时值精确还原、严重歪斜/低清拍照件——这些是当前技术边界，见 README 功能说明。

## Pull Request

1. Fork → 特性分支 → 开发（保持 commit 粒度，一个 commit 一件事）
2. 确保 `cargo test` 与 `npx tsc --noEmit` 全绿
3. PR 描述写清动机与验证方式；CI 会跑 macOS 构建检查
4. 由维护者 review 合并；**版本发布由维护者执行**（`scripts/release.sh`），贡献者无需也不应打 tag

## 许可

提交即表示同意将贡献内容以 [MIT](LICENSE) 许可随本项目发布。
