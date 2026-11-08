---
name: release
description: 发布 ScanScore 新版本——统一更新三处版本号、打 tag 并推送，CI 自动构建 GitHub Release。用于"发布 x.y.z 版本""/release x.y.z"等请求
---

发布 ScanScore 新版本的标准流程：

1. 确认用户给出的目标版本号（形如 x.y.z；未给出则询问，或建议按 semver 递增 patch）
2. 运行 `bash scripts/release.sh <版本号>`
3. 检查脚本输出：
   - 三处版本号（package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json）与 Cargo.lock 同步更新
   - commit 与 annotated tag 创建成功
   - push 成功（脚本在直连失败时自动走 127.0.0.1:7890 代理重试）
4. 向用户报告：GitHub Actions 页面（https://github.com/nova-fable/scan-score/actions）可看构建进度；构建完成后 Release 页自动出现 dmg/msi 安装包
5. 若脚本因「工作区不干净」「tag 已存在」「main 分叉」退出，如实转达原因，不要绕过校验

禁止：手动改三处版本号（会漏 Cargo.lock）、删除重打已推送的 tag、跳过脚本直接 push tag。
