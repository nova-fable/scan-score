//! PDF 处理：macOS 内置 sips（首页转 PNG 做封面）+ mdls（页数）。无外部动态库依赖。

use std::path::Path;
use std::process::Command;

/// 统计 PDF 页数（Spotlight 元数据；拿不到时返回 None）
pub fn page_count(path: &Path) -> Option<i64> {
    let out = Command::new("mdls")
        .arg("-name")
        .arg("kMDItemNumberOfPages")
        .arg("-raw")
        .arg(path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    text.parse::<i64>().ok()
}

/// 渲染 PDF 首页为 PNG（封面缩略图）
pub fn render_first_page(path: &Path, out_png: &Path) -> Result<(), String> {
    let out = Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(path)
        .arg("--out")
        .arg(out_png)
        .output()
        .map_err(|e| format!("sips 启动失败: {e}"))?;
    if out.status.success() && out_png.exists() {
        Ok(())
    } else {
        Err(format!(
            "PDF 封面渲染失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}
