//! 曲库备份：把应用数据目录打包为 zip / 从 zip 恢复。
//! 恢复会覆盖现有文件，数据库连接在内存中持有 → 恢复后需重启应用。

use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use crate::omr::AppState;

fn walk(dir: &Path, prefix: &str, zip: &mut zip::ZipWriter<File>) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() {
            walk(&path, &name, zip)?;
        } else {
            zip.start_file(&name, zip::write::SimpleFileOptions::default())
                .map_err(|e| e.to_string())?;
            let mut f = File::open(&path).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn export_backup(state: &AppState, target: &Path) -> Result<(), String> {
    let file = File::create(target).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    zip.add_directory("scores", zip::write::SimpleFileOptions::default())
        .map_err(|e| e.to_string())?;
    zip.add_directory("covers", zip::write::SimpleFileOptions::default())
        .map_err(|e| e.to_string())?;
    // 数据库文件写入前先 flush checkpoint（WAL）
    {
        let conn = state.db.0.lock().unwrap();
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    walk(&state.data_dir, "", &mut zip)?;
    zip.finish().map_err(|e| e.to_string())?.flush().ok();
    Ok(())
}

pub fn import_backup(state: &AppState, source: &Path) -> Result<usize, String> {
    let file = File::open(source).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name().map(|n| n.to_path_buf()) else {
            continue; // 跳过可疑路径
        };
        let target = state.data_dir.join(&name);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        std::fs::write(&target, &buf).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}
