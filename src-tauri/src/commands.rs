//! Tauri commands：曲库 CRUD、导入、识别任务、设置。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::now;
use crate::model::{Job, OmrProgressEvent, Score, ScoreQuery, Setting};
use crate::omr::{self, AppState};
use crate::{mxl, pdf};

type Ctx<'a> = State<'a, Arc<AppState>>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------------------
// 路径与安全校验
// ---------------------------------------------------------------------------

/// 仅允许访问应用数据目录内的文件（read_score_asset 防目录穿越）
fn ensure_inside_data_dir(state: &AppState, path: &Path) -> Result<(), String> {
    let canonical = path.canonicalize().map_err(err)?;
    let data_dir = state.data_dir.canonicalize().map_err(err)?;
    if canonical.starts_with(&data_dir) {
        Ok(())
    } else {
        Err("访问被拒绝：路径不在应用数据目录内".into())
    }
}

// ---------------------------------------------------------------------------
// 导入
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: Vec<Score>,
    pub skipped: Vec<String>,
}

#[tauri::command]
pub fn pick_import_files(app: AppHandle) -> Result<Vec<String>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter(
            "乐谱文件",
            &["pdf", "png", "jpg", "jpeg", "xml", "mxl", "musicxml", "gp", "gp3", "gp4", "gp5", "gpx", "tg"],
        )
        .blocking_pick_files();
    Ok(files
        .map(|items| {
            items
                .into_iter()
                .filter_map(|f| {
                    f.into_path()
                        .ok()
                        .map(|p| p.to_string_lossy().into_owned())
                })
                .collect()
        })
        .unwrap_or_default())
}

fn classify(ext: &str) -> Option<(&'static str, &'static str)> {
    // (source_type, 默认乐器)
    match ext {
        "pdf" => Some(("pdf", "other")),
        "png" => Some(("png", "other")),
        "jpg" | "jpeg" => Some(("jpg", "other")),
        "xml" | "mxl" | "musicxml" => Some(("musicxml", "other")),
        "gp" | "gp3" | "gp4" | "gp5" | "gpx" | "gpif" | "tg" => Some(("gp", "guitar")),
        _ => None,
    }
}

/// 导入文件：复制进应用数据目录并建立曲库条目。
/// - MusicXML/GP：立即可用 (status=ready)
/// - PDF/图片：待识别 (status=imported)
#[tauri::command]
pub fn import_files(paths: Vec<String>, state: Ctx) -> Result<ImportResult, String> {
    let mut imported = Vec::new();
    let mut skipped = Vec::new();

    for raw in paths {
        let src = PathBuf::from(&raw);
        if !src.exists() {
            skipped.push(raw);
            continue;
        }
        let ext = src
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let Some((source_type, default_instrument)) = classify(&ext) else {
            skipped.push(raw);
            continue;
        };

        let id = uuid::Uuid::new_v4().to_string();
        let score_dir = state.data_dir.join("scores").join(&id);
        std::fs::create_dir_all(&score_dir).map_err(err)?;
        let original = score_dir.join(format!("original.{ext}"));
        std::fs::copy(&src, &original).map_err(err)?;

        // PDF/图片：生成封面
        let mut cover_path = None;
        let mut page_count = 0i64;
        if source_type == "pdf" {
            if let Ok(pdfium) = bind_pdfium(state.inner()) {
                if let Ok(n) = pdf::page_count(&pdfium, &original) {
                    page_count = n as i64;
                }
                let cover = state.data_dir.join("covers").join(format!("{id}.png"));
                let _ = std::fs::create_dir_all(cover.parent().unwrap());
                match pdf::render_first_page(&pdfium, &original, &cover, 400) {
                    Ok(()) => cover_path = Some(cover.to_string_lossy().into_owned()),
                    Err(e) => log::warn!("封面生成失败: {e}"),
                }
            } else {
                log::warn!("pdfium 未绑定，跳过 PDF 页数/封面");
            }
        } else if matches!(source_type, "png" | "jpg") {
            // 图片源直接用原图做封面
            cover_path = Some(original.to_string_lossy().into_owned());
        }

        let mut title = src
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未命名".into());
        let mut composer = None;
        let mut instrument = default_instrument.to_string();
        let mut musicxml_path = None;
        let mut status = "imported";

        if source_type == "musicxml" {
            match mxl::load_musicxml_text(&original) {
                Ok(xml_text) => {
                    let xml_file = score_dir.join("score.xml");
                    std::fs::write(&xml_file, &xml_text).map_err(err)?;
                    musicxml_path = Some(xml_file.to_string_lossy().into_owned());
                    if let Ok(meta) = mxl::parse_meta(&xml_text) {
                        if let Some(t) = meta.title.filter(|t| !t.is_empty()) {
                            title = t;
                        }
                        composer = meta.composer;
                        if meta.part_count == 1 {
                            instrument = "piano".to_string();
                        }
                    }
                    status = "ready";
                }
                Err(e) => {
                    log::warn!("MusicXML 解析失败: {e}");
                    status = "failed";
                }
            }
        } else if source_type == "gp" {
            status = "ready";
        }

        let score = Score {
            id: id.clone(),
            title,
            composer,
            instrument: instrument.to_string(),
            source_type: source_type.to_string(),
            status: status.to_string(),
            original_path: Some(original.to_string_lossy().into_owned()),
            musicxml_path: musicxml_path,
            cover_path: cover_path,
            page_count,
            error_message: None,
            created_at: now(),
            updated_at: now(),
        };
        state.db.insert_score(&score).map_err(err)?;
        imported.push(score);
    }

    Ok(ImportResult { imported, skipped })
}

fn bind_pdfium(state: &AppState) -> Result<pdfium_render::prelude::Pdfium, pdf::PdfError> {
    let explicit = state
        .db
        .get_setting("pdfium_path")
        .ok()
        .flatten()
        .map(PathBuf::from);
    let lib = pdf::find_pdfium_lib(
        explicit.as_deref(),
        state.resource_dir.as_deref(),
    )
    .ok_or(pdf::PdfError::NotBound("无候选路径".into()))?;
    pdf::open_pdfium(&lib)
}

// ---------------------------------------------------------------------------
// 曲库 CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_scores(query: Option<ScoreQuery>, state: Ctx) -> Result<Vec<Score>, String> {
    state
        .db
        .list_scores(&query.unwrap_or_default())
        .map_err(err)
}

#[tauri::command]
pub fn get_score(id: String, state: Ctx) -> Result<Option<Score>, String> {
    state.db.get_score(&id).map_err(err)
}

#[tauri::command]
pub fn update_score(
    id: String,
    title: String,
    composer: Option<String>,
    instrument: Option<String>,
    state: Ctx,
) -> Result<Score, String> {
    let instrument = instrument.unwrap_or_else(|| "other".into());
    state
        .db
        .update_score_meta(&id, &title, composer.as_deref(), &instrument)
        .map_err(err)?;
    state.db.get_score(&id).map_err(err)?.ok_or_else(|| "条目不存在".into())
}

#[tauri::command]
pub fn delete_score(id: String, state: Ctx) -> Result<(), String> {
    // 删除文件目录与封面
    let score_dir = state.data_dir.join("scores").join(&id);
    if score_dir.exists() {
        std::fs::remove_dir_all(&score_dir).map_err(err)?;
    }
    let cover = state.data_dir.join("covers").join(format!("{id}.png"));
    if cover.exists() {
        let _ = std::fs::remove_file(&cover);
    }
    state.db.delete_score(&id).map_err(err)?;
    Ok(())
}

/// 读取曲库资产（乐谱文件/封面）给前端渲染；仅限应用数据目录内
#[tauri::command]
pub fn read_score_asset(path: String, state: Ctx) -> Result<Vec<u8>, String> {
    let p = PathBuf::from(&path);
    ensure_inside_data_dir(state.inner(), &p)?;
    std::fs::read(&p).map_err(err)
}

// ---------------------------------------------------------------------------
// 识别任务
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_recognition(score_ids: Vec<String>, state: Ctx) -> Result<Vec<Job>, String> {
    let mut jobs = Vec::new();
    for score_id in score_ids {
        // 已 ready 的不重复排队
        if let Ok(Some(score)) = state.db.get_score(&score_id) {
            if score.status == "ready" || score.status == "processing" {
                continue;
            }
        }
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            score_id: score_id.clone(),
            kind: "omr".into(),
            state: "queued".into(),
            progress: 0,
            message: None,
            created_at: now(),
            updated_at: now(),
            finished_at: None,
        };
        state.db.insert_job(&job).map_err(err)?;
        state
            .db
            .update_score_status(&score_id, "processing", None)
            .map_err(err)?;
        jobs.push(job);
    }
    if !jobs.is_empty() {
        state.queue.notify();
    }
    Ok(jobs)
}

#[tauri::command]
pub fn cancel_recognition(job_id: String, state: Ctx) -> Result<(), String> {
    state.queue.request_cancel(&job_id);
    Ok(())
}

#[tauri::command]
pub fn list_jobs(score_id: Option<String>, state: Ctx) -> Result<Vec<Job>, String> {
    state.db.list_jobs(score_id.as_deref()).map_err(err)
}

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: Ctx) -> Result<Vec<Setting>, String> {
    let keys = ["engine_path", "pdfium_path"];
    Ok(keys
        .iter()
        .filter_map(|k| {
            state
                .db
                .get_setting(k)
                .ok()
                .flatten()
                .map(|v| Setting { key: k.to_string(), value: v })
        })
        .collect())
}

#[tauri::command]
pub fn set_setting(key: String, value: String, state: Ctx) -> Result<(), String> {
    if !matches!(key.as_str(), "engine_path" | "pdfium_path") {
        return Err(format!("未知设置项: {key}"));
    }
    state.db.set_setting(&key, &value).map_err(err)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub data_dir: String,
    pub resource_dir: Option<String>,
    pub engine_found: bool,
    pub engine_path: Option<String>,
    pub pdfium_found: bool,
}

#[tauri::command]
pub fn get_app_info(state: Ctx) -> Result<AppInfo, String> {
    let engine = omr::resolve_engine(state.inner()).ok();
    let pdfium_found = bind_pdfium(state.inner()).is_ok();
    Ok(AppInfo {
        data_dir: state.data_dir.to_string_lossy().into_owned(),
        resource_dir: state
            .resource_dir
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned()),
        engine_found: engine.is_some(),
        engine_path: engine.map(|c| c.launcher.to_string_lossy().into_owned()),
        pdfium_found,
    })
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

/// 弹出保存对话框，返回用户选择的目标路径（未选择返回 None）
#[tauri::command]
pub fn pick_save_path(file_name: String, ext: String, app: AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter(&format!("{ext} 文件"), &[ext.as_str()])
        .blocking_pick_file();
    Ok(path.map(|p| p.into_path().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default())
        .filter(|s| !s.is_empty()))
}

/// 把前端生成的字节（如 MIDI 导出）写到用户指定路径
#[tauri::command]
pub fn write_export_bytes(path: String, bytes: Vec<u8>, state: Ctx) -> Result<(), String> {
    let p = PathBuf::from(&path);
    // 目录必须已存在或可创建；不做数据目录限制（路径由用户对话框选择）
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    let _ = &state;
    std::fs::write(&p, &bytes).map_err(err)
}

/// 导出曲谱源文件（识别产物 score.xml 或原始 GP/MusicXML）到目标路径
#[tauri::command]
pub fn export_score_source(id: String, target: String, state: Ctx) -> Result<(), String> {
    let score = state
        .db
        .get_score(&id)
        .map_err(err)?
        .ok_or_else(|| "条目不存在".to_string())?;
    let src = score
        .musicxml_path
        .or(score.original_path)
        .ok_or_else(|| "没有可导出的乐谱文件".to_string())?;
    std::fs::copy(&src, &target).map_err(err)?;
    Ok(())
}

/// 测试事件通道（开发用）
#[tauri::command]
pub fn emit_test_progress(state: Ctx) -> Result<(), String> {
    use tauri::Emitter;
    state
        .app_handle
        .emit(
            "omr://progress",
            OmrProgressEvent {
                job_id: "test".into(),
                score_id: "test".into(),
                state: "running".into(),
                progress: 42,
                message: Some("测试事件".into()),
            },
        )
        .map_err(err)
}
