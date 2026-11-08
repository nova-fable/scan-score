//! 文件夹导入辅助：自然排序、多页图片纵向拼接。

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

/// 自然排序比较："page2.png" < "page10.png"
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut ia = a.char_indices().peekable();
    let mut ib = b.char_indices().peekable();
    let ab = a.as_bytes();
    let bb = b.as_bytes();

    let mut i = 0usize;
    let mut j = 0usize;
    loop {
        let (ca, cb) = match (ab.get(i), bb.get(j)) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => (*x, *y),
        };
        if ca.is_ascii_digit() && cb.is_ascii_digit() {
            // 提取两段数字，按数值比较（忽略前导零）
            let sa = take_digits(ab, &mut i);
            let sb = take_digits(bb, &mut j);
            let na: u64 = sa.parse().unwrap_or(u64::MAX);
            let nb: u64 = sb.parse().unwrap_or(u64::MAX);
            match na.cmp(&nb) {
                Ordering::Equal => continue,
                other => return other,
            }
        }
        match ca.to_ascii_lowercase().cmp(&cb.to_ascii_lowercase()) {
            Ordering::Equal => {
                i += 1;
                j += 1;
            }
            other => return other,
        }
    }
}

fn take_digits(bytes: &[u8], i: &mut usize) -> String {
    let start = *i;
    while *i < bytes.len() && bytes[*i].is_ascii_digit() {
        *i += 1;
    }
    String::from_utf8_lossy(&bytes[start..*i]).into_owned()
}

/// 把多张图片纵向拼接为一张长图（宽度以最宽者为准，其余等比缩放，白底填充）。
/// 用于"几张图片谱合并为一首"：同源截图拼接后可被 OMR 当作连续谱面识别。
pub fn concat_images(paths: &[PathBuf], out: &Path) -> Result<(), String> {
    use image::imageops::FilterType;
    use image::{Rgba, RgbaImage};

    if paths.is_empty() {
        return Err("没有可拼接的图片".into());
    }

    let mut loaded: Vec<RgbaImage> = Vec::with_capacity(paths.len());
    let mut width = 0u32;
    for p in paths {
        let img = image::open(p).map_err(|e| format!("读取图片失败 {}: {e}", p.display()))?;
        let img = img.to_rgba8();
        width = width.max(img.width());
        loaded.push(img);
    }

    let resized: Vec<RgbaImage> = loaded
        .into_iter()
        .map(|img| {
            if img.width() == width {
                img
            } else {
                let h = ((img.height() as f64) * (width as f64 / img.width() as f64)).round() as u32;
                image::imageops::resize(&img, width, h.max(1), FilterType::Lanczos3)
            }
        })
        .collect();

    let total_height: u32 = resized.iter().map(|i| i.height()).sum();
    let mut canvas = RgbaImage::from_pixel(width, total_height, Rgba([255, 255, 255, 255]));
    let mut y = 0u32;
    for img in &resized {
        image::imageops::overlay(&mut canvas, img, 0, y as i64);
        y += img.height();
    }
    canvas
        .save_with_format(out, image::ImageFormat::Png)
        .map_err(|e| format!("保存拼接图失败: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_natural_cmp() {
        let mut names = vec!["page10.png", "page2.png", "page1.png", "Page3.png"];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, vec!["page1.png", "page2.png", "Page3.png", "page10.png"]);

        assert_eq!(natural_cmp("a2b", "a10b"), Ordering::Less);
        assert_eq!(natural_cmp("1", "01"), Ordering::Equal);
        assert_eq!(natural_cmp("x", "x1"), Ordering::Less);
    }

    #[test]
    fn test_concat_images() {
        // 生成两张不同宽度的小图，拼接后校验尺寸
        let dir = std::env::temp_dir().join(format!("scanscore-concat-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a.png");
        let b = dir.join("b.png");
        image::RgbaImage::from_pixel(100, 50, image::Rgba([255, 0, 0, 255]))
            .save_with_format(&a, image::ImageFormat::Png)
            .unwrap();
        image::RgbaImage::from_pixel(80, 40, image::Rgba([0, 255, 0, 255]))
            .save_with_format(&b, image::ImageFormat::Png)
            .unwrap();

        let out = dir.join("merged.png");
        concat_images(&[a.clone(), b.clone()], &out).unwrap();
        let img = image::open(&out).unwrap();
        assert_eq!(img.width(), 100);
        assert_eq!(img.height(), 50 + 40 * 100 / 80); // b 等比放大到宽 100
        let _ = std::fs::remove_dir_all(&dir);
    }
}
