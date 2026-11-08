#!/usr/bin/env bash
# ScanScore 发布脚本：统一更新三处版本号 → commit → tag → push（CI 自动构建 Release）
# 用法: bash scripts/release.sh x.y.z
set -euo pipefail

VERSION="${1:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "用法: release.sh x.y.z（语义化版本号）"; exit 1; }
cd "$(dirname "$0")/.."

[[ -z $(git status --porcelain) ]] || { echo "✗ 工作区不干净，先提交或暂存"; exit 1; }
fetch_origin_main() {
  git fetch origin main --quiet 2>/dev/null && return 0
  git -c http.proxy=http://127.0.0.1:7890 fetch origin main --quiet 2>/dev/null && return 0
  return 1
}
if fetch_origin_main; then
  # 仅拒绝"远端有本地没有的提交"（真分叉）；本地领先是正常的，会随发布一起推上去
  behind=$(git rev-list --count main..origin/main)
  [[ "$behind" -eq 0 ]] || { echo "✗ 远端 main 有 $behind 个本地缺失的提交，先 pull 同步"; exit 1; }
else
  echo "⚠ 无法连接远端，跳过分叉检查（离线环境）"
fi

TAG="v$VERSION"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && { echo "✗ tag $TAG 已存在"; exit 1; }

# 三处版本号
npm version "$VERSION" --no-git-tag-version >/dev/null
perl -pi -e "s/^version = \"[0-9.]+\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
perl -pi -e "s/\"version\": \"[0-9.]+\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json
cargo update -w --quiet 2>/dev/null || true   # 同步 Cargo.lock 中本包版本

# 校验三处一致
for f in package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json; do
  grep -q "$VERSION" "$f" || { echo "✗ $f 版本号更新失败"; exit 1; }
done

if [[ "${2:-}" == "--dry-run" ]]; then
  echo "【dry-run】将执行: 三处版本号→$VERSION ✓ | commit 'release v$VERSION' | tag $TAG | push main+tag"
  git checkout -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
  git checkout -- src-tauri/Cargo.lock package-lock.json 2>/dev/null || true
  echo "【dry-run】版本号已还原，无副作用"
  exit 0
fi

git add -A
git commit -m "release v$VERSION"
git tag -a "$TAG" -m "ScanScore $TAG"

# push：直连失败自动走本机代理
git push origin main || git -c http.proxy=http://127.0.0.1:7890 push origin main
git push origin "$TAG" || git -c http.proxy=http://127.0.0.1:7890 push origin "$TAG"

echo "✓ v$VERSION 已推送 —— CI 正在构建，完成后自动创建 GitHub Release"
echo "  进度: https://github.com/nova-fable/scan-score/actions"
