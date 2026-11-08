//! 生成应用图标 1024x1024: 靛紫渐变圆角底 + 白色双八分音符
use image::{Rgba, RgbaImage, ImageFormat};

fn main() {
    const S: f64 = 1024.0;
    const R: f64 = 230.0;
    let mut img = RgbaImage::new(S as u32, S as u32);

    for py in 0..1024i64 {
        for px in 0..1024i64 {
            let (x, y) = (px as f64, py as f64);
            let cx = x.min(S - 1.0 - x);
            let cy = y.min(S - 1.0 - y);
            let (dx, dy) = (R - cx, R - cy);
            let inside_rr = cx >= R || cy >= R || (dx * dx + dy * dy <= R * R);
            if !inside_rr {
                continue;
            }
            let t = y / S;
            let r = (0x4f as f64 + (0x7c as f64 - 0x4f as f64) * t) as u8;
            let g = (0x46 as f64 + (0x3a as f64 - 0x46 as f64) * t) as u8;
            let b = (0xe5 as f64 + (0xed as f64 - 0xe5 as f64) * t) as u8;
            img.put_pixel(px as u32, py as u32, Rgba([r, g, b, 255]));
        }
    }

    let white = Rgba([255u8, 255, 255, 255]);

    // 符头（斜椭圆）
    let heads = [(360.0f64, 700.0f64), (668.0, 636.0)];
    for (hcx, hcy) in heads {
        let (rx, ry) = (125.0f64, 88.0f64);
        let ang = -18.0f64.to_radians();
        let (ca, sa) = (ang.cos(), ang.sin());
        for py in (hcy as i64 - 100)..(hcy as i64 + 100) {
            for px in (hcx as i64 - 140)..(hcx as i64 + 140) {
                let (dx, dy) = (px as f64 - hcx, py as f64 - hcy);
                let (u, v) = (dx * ca + dy * sa, -dx * sa + dy * ca);
                if (u / rx).powi(2) + (v / ry).powi(2) <= 1.0
                    && px >= 0 && py >= 0 && px < 1024 && py < 1024
                {
                    img.put_pixel(px as u32, py as u32, white);
                }
            }
        }
    }

    // 符干
    for py in 250..669i64 {
        for px in 452..481i64 {
            img.put_pixel(px as u32, py as u32, white);
        }
    }
    for py in 220..605i64 {
        for px in 760..789i64 {
            img.put_pixel(px as u32, py as u32, white);
        }
    }

    // 符梁（斜带: 左(452,250) 右(788,220)，厚 58）
    for t in 0..=336i64 {
        let tt = t as f64 / 336.0;
        let x_top = 452.0 + 336.0 * tt;
        let y_top = 250.0 - 30.0 * tt;
        for dy in 0..58i64 {
            let px = x_top as i64 + dy / 3;
            let py = y_top as i64 + dy;
            if px >= 0 && px < 1024 && py >= 0 && py < 1024 {
                img.put_pixel(px as u32, py as u32, white);
            }
        }
    }

    img.save_with_format("/tmp/app-icon.png", ImageFormat::Png).unwrap();
    println!("icon -> /tmp/app-icon.png");
}
