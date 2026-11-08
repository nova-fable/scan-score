//! PDF 处理 facade：page_count / render_first_page 两个稳定接口。
//!
//! - macOS：系统内置 `sips`（首页转 PNG）+ `mdls`（页数），零外部依赖
//! - Windows（规划）：pdfium-render + 打包 pdfium.dll，见 cfg(not(target_os = "macos")) 存根
//!
//! 新平台支持时只需实现 imp 模块，调用方（import 流程）不改。

use std::path::Path;

/// 统计 PDF 页数（拿不到时返回 None）
pub fn page_count(path: &Path) -> Option<i64> {
    imp::page_count(path)
}

/// 渲染 PDF 首页为 PNG（封面缩略图）
pub fn render_first_page(path: &Path, out_png: &Path) -> Result<(), String> {
    imp::render_first_page(path, out_png)
}

#[cfg(target_os = "macos")]
mod imp {
    use std::path::Path;
    use std::process::Command;

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
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use std::path::Path;

    // Windows/Linux 计划实现：pdfium-render + 随应用打包 pdfium 动态库。
    // 在此之前优雅降级：封面缺失、页数为 0，不影响导入与识别主流程。

    pub fn page_count(_path: &Path) -> Option<i64> {
        None
    }

    pub fn render_first_page(_path: &Path, _out_png: &Path) -> Result<(), String> {
        Err("PDF 封面渲染暂不支持当前平台".into())
    }
}
