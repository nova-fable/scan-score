//! 识别核心集成测试（需要本机安装 Audiveris，默认忽略）
//! 运行: cargo test --test omr_pipeline -- --ignored

use std::path::{Path, PathBuf};

use scan_score_lib::mxl;
use scan_score_lib::omr::{run_batch, CancelState, EngineConfig};

fn engine() -> Option<EngineConfig> {
    let candidates = [
        "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
        "/tmp/audiveris-extract/Audiveris.app/Contents/MacOS/Audiveris",
    ];
    candidates
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
        .map(|launcher| EngineConfig { launcher })
}

fn sample(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../samples")
        .join(name)
}

#[test]
#[ignore]
fn test_full_recognition_pipeline() {
    let Some(engine) = engine() else {
        panic!("未找到 Audiveris，请安装后重试");
    };
    let input = sample("cucaracha.png");
    assert!(input.exists(), "样例文件缺失");

    let out_dir = std::env::temp_dir().join(format!("scanscore-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&out_dir);

    let cancel = CancelState::new();
    let produced = run_batch(&engine, &[input], &out_dir, cancel, |_, _| {}).expect("识别失败");

    assert!(!produced.is_empty(), "未产出 .mxl");

    // 解包 + 元数据（与 execute_job 相同的后处理）
    let xml = mxl::load_musicxml_text(&produced[0]).expect("mxl 解包失败");
    assert!(xml.contains("<score-partwise"), "不是 MusicXML 内容");
    let meta = mxl::parse_meta(&xml).expect("元数据解析失败");
    assert!(meta.part_count >= 1, "应至少有一个声部");

    let _ = std::fs::remove_dir_all(&out_dir);
}
