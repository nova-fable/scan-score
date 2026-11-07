//! PDF 光栅化（pdfium）: 页数统计与封面缩略图。

use std::path::{Path, PathBuf};
use thiserror::Error;

use pdfium_render::prelude::*;

#[derive(Debug, Error)]
pub enum PdfError {
    #[error("未找到 pdfium 动态库，请在设置中指定路径")]
    NotBound(String),
    #[error("pdfium 加载失败: {0}")]
    Bind(String),
    #[error("pdf 处理错误: {0}")]
    Pdf(#[from] PdfiumError),
    #[error("图片保存失败: {0}")]
    Image(#[from] image::ImageError),
    #[error("io 错误: {0}")]
    Io(#[from] std::io::Error),
}

/// pdfium.dylib 解析候选路径：
/// 1. 显式指定路径
/// 2. 环境变量 PDFIUM_DYLIB
/// 3. 应用资源目录 (resources/pdfium.dylib)
/// 4. 可执行文件同级目录
pub fn find_pdfium_lib(explicit: Option<&Path>, resource_dir: Option<&Path>) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(p) = explicit {
        candidates.push(p.to_path_buf());
    }
    if let Ok(env_path) = std::env::var("PDFIUM_DYLIB") {
        candidates.push(PathBuf::from(env_path));
    }
    if let Some(res) = resource_dir {
        candidates.push(res.join("pdfium.dylib"));
        candidates.push(res.join("resources").join("pdfium.dylib"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("pdfium.dylib"));
            candidates.push(dir.join("../lib/pdfium.dylib"));
        }
    }
    candidates.into_iter().find(|p| p.exists())
}

/// 创建绑定到动态库的 Pdfium 实例
pub fn open_pdfium(lib_path: &Path) -> Result<Pdfium, PdfError> {
    let bindings = Pdfium::bind_to_library(lib_path)
        .map_err(|e| PdfError::Bind(e.to_string()))?;
    Ok(Pdfium::new(bindings))
}

/// 统计 PDF 页数
pub fn page_count(pdfium: &Pdfium, path: &Path) -> Result<usize, PdfError> {
    let doc = pdfium.load_pdf_from_file(path, None)?;
    Ok(doc.pages().len() as usize)
}

/// 渲染首页为 PNG（封面缩略图），按目标宽度等比缩放
pub fn render_first_page(
    pdfium: &Pdfium,
    path: &Path,
    out_png: &Path,
    target_width: u16,
) -> Result<(), PdfError> {
    let doc = pdfium.load_pdf_from_file(path, None)?;
    let page = doc.pages().get(0)?;
    let config = PdfRenderConfig::new().set_target_width(target_width.into());
    let bitmap = page.render_with_config(&config)?;
    let image = bitmap.as_image();
    // 保存为 PNG；pdfium-render 的 as_image 依赖 image crate
    image.save_with_format(out_png, image::ImageFormat::Png)?;
    Ok(())
}
