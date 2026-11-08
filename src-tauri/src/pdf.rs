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

#[cfg(windows)]
mod imp {
    // Windows: pdfium-render + 随包 pdfium.dll（Cargo.toml [target.'cfg(windows)'.dependencies]）
    use std::path::Path;
    use pdfium_render::prelude::*;

    fn open(path: &Path) -> Result<Pdfium, String> {
        // 解析 pdfium.dll: 可执行文件目录 / 资源目录 / PDFIUM_DLL 环境变量
        let mut candidates = Vec::new();
        if let Ok(env_path) = std::env::var("PDFIUM_DLL") {
            candidates.push(PathBuf::from(env_path));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                candidates.push(dir.join("pdfium.dll"));
            }
        }
        let lib = candidates
            .into_iter()
            .find(|p| p.exists())
            .ok_or("未找到 pdfium.dll（应随应用打包）")?;
        let bindings = Pdfium::bind_to_library(&lib).map_err(|e| e.to_string())?;
        Ok(Pdfium::new(bindings))
    }

    pub fn page_count(path: &Path) -> Option<i64> {
        let pdfium = open(path).ok()?;
        let doc = pdfium.load_pdf_from_file(path, None).ok()?;
        Some(doc.pages().len() as i64)
    }

    pub fn render_first_page(path: &Path, out_png: &Path) -> Result<(), String> {
        let pdfium = open(path)?;
        let doc = pdfium.load_pdf_from_file(path, None).map_err(|e| e.to_string())?;
        let page = doc.pages().get(0).map_err(|e| e.to_string())?;
        let config = PdfRenderConfig::new().set_target_width(800);
        let bitmap = page.render_with_config(&config).map_err(|e| e.to_string())?;
        bitmap
            .as_image()
            .save_with_format(out_png, image::ImageFormat::Png)
            .map_err(|e| e.to_string())
    }
    use std::path::PathBuf;
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    use std::path::Path;

    pub fn page_count(_path: &Path) -> Option<i64> {
        None
    }

    pub fn render_first_page(_path: &Path, _out_png: &Path) -> Result<(), String> {
        Err("PDF 封面渲染暂不支持当前平台".into())
    }
}
