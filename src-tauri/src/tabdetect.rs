//! 六线谱（TAB）图像判据：检测图中是否存在 6 条线的谱表组。
//!
//! 思路：灰度缩放 → 二值化 → 逐行暗像素占比找"横线行" → 折叠成线中心 →
//! 按间距分组为谱表 → 数每组的线数。钢琴大谱表是两个 5 线组（组间距大），
//! 不会被误判；6 线组占多数（或存在且不少于 5 线组）则判为 TAB。

use std::path::Path;

const ANALYSIS_WIDTH: u32 = 800;
const LINE_ROW_RATIO: f64 = 0.45;

/// 判断图片是否像六线谱谱面
pub fn looks_like_tab(path: &Path) -> bool {
    let Ok(img) = image::open(path) else {
        return false;
    };
    let gray = img.to_luma8();
    // 缩放到固定宽度，降低噪声与计算量
    let scale_w = ANALYSIS_WIDTH.min(gray.width());
    let scale_h = ((gray.height() as f64) * (scale_w as f64 / gray.width() as f64)).round() as u32;
    let small = image::imageops::resize(&gray, scale_w, scale_h.max(1), image::imageops::FilterType::Triangle);

    let w = small.width();

    // 谱线行判据：整行中位数亮度显著低于背景。
    // 谱线横贯整行 → 行中位数=线的颜色；文字行大量空白 → 中位数仍是背景白。
    // 这对浅灰谱线(亮度~229)和深黑谱线同样有效。
    let mut row_medians: Vec<u8> = Vec::with_capacity(small.height() as usize);
    for row in small.rows() {
        let mut vals: Vec<u8> = row.map(|p| p[0]).collect();
        vals.sort_unstable();
        row_medians.push(vals[vals.len() / 2]);
    }
    // 背景色 = 行中位数的中位数
    let mut sorted_medians = row_medians.clone();
    sorted_medians.sort_unstable();
    let bg = sorted_medians[sorted_medians.len() / 2] as i32;

    let is_line_row = |y: usize| -> bool {
        (row_medians[y] as i32) < bg - 8
    };

    // 折叠连续"线行"为线中心
    let mut centers: Vec<usize> = Vec::new();
    let mut run_start: Option<usize> = None;
    for (y, _) in row_medians.iter().enumerate() {
        if is_line_row(y) {
            if run_start.is_none() {
                run_start = Some(y);
            }
        } else if let Some(s) = run_start.take() {
            centers.push((s + y) / 2);
        }
    }
    if let Some(s) = run_start {
        centers.push((s + row_medians.len()) / 2);
    }
    if centers.len() < 6 {
        return false;
    }

    // 按间距分组为谱表：新线与当前组第一条线的间距超过组内平均线距的 3 倍（或 40px）→ 新组
    let mut staves: Vec<Vec<usize>> = Vec::new();
    for &c in &centers {
        match staves.last_mut() {
            Some(group) if group.len() >= 2 => {
                let first = group[0];
                let last = *group.last().unwrap();
                let avg_gap = (last - first) as f64 / (group.len() - 1) as f64;
                let gap = (c - last) as f64;
                if gap <= (avg_gap * 3.0).max(12.0) {
                    group.push(c);
                } else {
                    staves.push(vec![c]);
                }
            }
            Some(group) => {
                let gap = (c - *group.last().unwrap()) as f64;
                if gap <= 40.0 {
                    group.push(c);
                } else {
                    staves.push(vec![c]);
                }
            }
            None => staves.push(vec![c]),
        }
    }

    let six = staves.iter().filter(|g| g.len() == 6).count();
    let five = staves.iter().filter(|g| g.len() == 5).count();
    // 至少存在一个 6 线组，且不少于 5 线组（兼容五线+六线混排：也走 VLM 更好）
    six > 0 && six >= five
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};
    type LumaImage = GrayImage;

    fn draw_staff(img: &mut LumaImage, y0: u32, lines: u32, gap: u32, thickness: u32) {
        for i in 0..lines {
            let y = y0 + i * gap;
            for dy in 0..thickness {
                for x in 40..760 {
                    let yy = y + dy;
                    if yy < img.height() {
                        img.put_pixel(x, yy, Luma([20u8]));
                    }
                }
            }
        }
    }

    fn write_tmp(img: &LumaImage) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!(
            "tabdetect-{}-{}.png",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .subsec_nanos()
        ));
        img.save_with_format(&p, image::ImageFormat::Png).unwrap();
        p
    }

    #[test]
    fn test_six_line_tab_detected() {
        let mut img = LumaImage::from_pixel(800, 900, Luma([240u8]));
        draw_staff(&mut img, 100, 6, 12, 2);
        draw_staff(&mut img, 350, 6, 12, 2);
        draw_staff(&mut img, 600, 6, 12, 2);
        let p = write_tmp(&img);
        assert!(looks_like_tab(&p));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn test_piano_grand_staff_not_tab() {
        let mut img = LumaImage::from_pixel(800, 900, Luma([240u8]));
        // 大谱表：两个 5 线组，组间距 60（远大于线距 12）
        draw_staff(&mut img, 150, 5, 12, 2);
        draw_staff(&mut img, 222, 5, 12, 2);
        draw_staff(&mut img, 550, 5, 12, 2);
        draw_staff(&mut img, 622, 5, 12, 2);
        let p = write_tmp(&img);
        assert!(!looks_like_tab(&p));
        let _ = std::fs::remove_file(&p);
    }

    #[test]
    fn test_blank_image_not_tab() {
        let img = LumaImage::from_pixel(800, 600, Luma([240u8]));
        let p = write_tmp(&img);
        assert!(!looks_like_tab(&p));
        let _ = std::fs::remove_file(&p);
    }
}
