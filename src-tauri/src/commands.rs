//! Tauri commands：曲库 CRUD、导入、识别任务、设置。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::now;
use crate::import::{concat_images, natural_cmp};
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

/// 弹出文件选择对话框。
/// 注意：必须放到后台线程执行——同步 command 运行在主线程，
/// 而 blocking_pick_files 阻塞主线程会与面板自身的事件循环死锁（转菊花）。
#[tauri::command]
pub async fn pick_import_files(app: AppHandle) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let files = app.dialog().file().add_filter(
            "乐谱文件",
            &[
                "pdf", "png", "jpg", "jpeg", "avif", "webp", "xml", "mxl", "musicxml", "gp",
                "gp3", "gp4", "gp5", "gpx", "tg",
            ],
        );
        match files.blocking_pick_files() {
            Some(items) => Ok(items
                .into_iter()
                .filter_map(|f| {
                    f.into_path()
                        .ok()
                        .map(|p| p.to_string_lossy().into_owned())
                })
                .collect()),
            None => Ok(Vec::new()),
        }
    })
    .await
    .map_err(err)?
}

/// 选择文件夹（用于"整本图片谱一次导入"）
#[tauri::command]
pub async fn pick_import_folder(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(app
            .dialog()
            .file()
            .blocking_pick_folder()
            .and_then(|f| f.into_path().ok())
            .map(|p| p.to_string_lossy().into_owned()))
    })
    .await
    .map_err(err)?
}

/// 列出文件夹内的乐谱图片/PDF（自然排序：page2 < page10）
#[tauri::command]
pub fn list_folder_scores(folder: String) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&folder);
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(err)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .filter(|p| {
            let ext = p
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "avif" | "webp" | "pdf"
            )
        })
        .collect();
    files.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));
    Ok(files
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

/// 合并导入：多张图片谱纵向拼接为一首曲子，一次识别产出连续的 MusicXML。
#[tauri::command]
pub async fn import_merged(paths: Vec<String>, state: Ctx<'_>) -> Result<Score, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || import_merged_impl(&state, paths))
        .await
        .map_err(err)?
}

fn import_merged_impl(state: &AppState, paths: Vec<String>) -> Result<Score, String> {
    // 只合并图片（PDF 本身已是多页，单独导入）
    let mut page_srcs: Vec<PathBuf> = Vec::new();
    for raw in &paths {
        let p = PathBuf::from(raw);
        if !p.exists() {
            continue;
        }
        let ext = p
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "avif" | "webp") {
            page_srcs.push(p);
        }
    }
    if page_srcs.len() < 2 {
        return Err("合并导入至少需要两张图片".into());
    }
    page_srcs.sort_by(|a, b| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()));

    let id = uuid::Uuid::new_v4().to_string();
    let score_dir = state.data_dir.join("scores").join(&id);
    let pages_dir = score_dir.join("pages");
    std::fs::create_dir_all(&pages_dir).map_err(err)?;

    // 每页复制/转码入库
    let mut pages: Vec<PathBuf> = Vec::with_capacity(page_srcs.len());
    for (i, src) in page_srcs.iter().enumerate() {
        let ext = src
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let target = if matches!(ext.as_str(), "avif" | "webp") {
            let t = pages_dir.join(format!("page-{}.png", i + 1));
            if !convert_to_png(src, &t) {
                return Err(format!("第 {} 页图片转码失败", i + 1));
            }
            t
        } else {
            let t = pages_dir.join(format!("page-{}.{ext}", i + 1));
            std::fs::copy(src, &t).map_err(err)?;
            t
        };
        pages.push(target);
    }

    // 纵向拼接 → 识别输入
    let merged = score_dir.join("original.png");
    concat_images(&pages, &merged).map_err(err)?;

    // 封面 = 第一页（统一转 PNG）
    let cover = state.data_dir.join("covers").join(format!("{id}.png"));
    let _ = std::fs::create_dir_all(cover.parent().unwrap());
    if let Err(e) = image::open(&pages[0])
        .and_then(|img| img.save_with_format(&cover, image::ImageFormat::Png))
    {
        log::warn!("封面生成失败: {e}");
    }

    let title = page_srcs[0]
        .parent()
        .and_then(|d| d.file_name())
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "合并曲谱".into());

    let score = Score {
        id: id.clone(),
        title,
        composer: None,
        instrument: "other".into(),
        source_type: "png".into(),
        status: "imported".into(),
        original_path: Some(merged.to_string_lossy().into_owned()),
        musicxml_path: None,
        cover_path: Some(cover.to_string_lossy().into_owned()),
        pages: pages.iter().map(|p| p.to_string_lossy().into_owned()).collect(),
        page_count: pages.len() as i64,
        error_message: None,
        created_at: now(),
        updated_at: now(),
    };
    state.db.insert_score(&score).map_err(err)?;
    Ok(score)
}

fn classify(ext: &str) -> Option<(&'static str, &'static str)> {    // (source_type, 默认乐器)。avif/webp 归一化为 png（导入时经 sips 转码）
    match ext {
        "pdf" => Some(("pdf", "other")),
        "png" => Some(("png", "other")),
        "jpg" | "jpeg" => Some(("jpg", "other")),
        "avif" | "webp" => Some(("png", "other")),
        "xml" | "mxl" | "musicxml" => Some(("musicxml", "other")),
        "gp" | "gp3" | "gp4" | "gp5" | "gpx" | "gpif" | "tg" => Some(("gp", "guitar")),
        _ => None,
    }
}

/// avif/webp → png（macOS 内置 sips；Java ImageIO 不支持这两种格式，先转码才能送 OMR）
fn convert_to_png(src: &Path, target: &Path) -> bool {
    std::process::Command::new("sips")
        .arg("-s")
        .arg("format")
        .arg("png")
        .arg(src)
        .arg("--out")
        .arg(target)
        .output()
        .map(|o| o.status.success() && target.exists())
        .unwrap_or(false)
}

/// 导入文件：复制进应用数据目录并建立曲库条目（含 PDF 封面渲染，放后台线程）。
/// - MusicXML/GP：立即可用 (status=ready)
/// - PDF/图片：待识别 (status=imported)
#[tauri::command]
pub async fn import_files(paths: Vec<String>, state: Ctx<'_>) -> Result<ImportResult, String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || import_files_impl(&state, paths))
        .await
        .map_err(err)?
}

fn import_files_impl(state: &AppState, paths: Vec<String>) -> Result<ImportResult, String> {
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

        // avif/webp 转成 png 后按 png 处理；其余原样复制
        let original = if matches!(ext.as_str(), "avif" | "webp") {
            let target = score_dir.join("original.png");
            if !convert_to_png(&src, &target) {
                log::warn!("avif/webp 转 png 失败，跳过: {raw}");
                skipped.push(raw);
                continue;
            }
            target
        } else {
            let p = score_dir.join(format!("original.{ext}"));
            std::fs::copy(&src, &p).map_err(err)?;
            p
        };

        // PDF/图片：生成封面
        let mut cover_path = None;
        let mut page_count = 0i64;
        if source_type == "pdf" {
            if let Some(n) = pdf::page_count(&original) {
                page_count = n;
            }
            let cover = state.data_dir.join("covers").join(format!("{id}.png"));
            let _ = std::fs::create_dir_all(cover.parent().unwrap());
            match pdf::render_first_page(&original, &cover) {
                Ok(()) => cover_path = Some(cover.to_string_lossy().into_owned()),
                Err(e) => log::warn!("封面生成失败: {e}"),
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
            instrument,
            source_type: source_type.to_string(),
            status: status.to_string(),
            original_path: Some(original.to_string_lossy().into_owned()),
            musicxml_path,
            cover_path,
            pages: Vec::new(),
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
    let keys = ["engine_path", "vlm_api_base", "vlm_api_key", "vlm_model", "vlm_thinking", "upscale_width", "audiveris_args"];
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
    if !matches!(
        key.as_str(),
        "engine_path" | "vlm_api_base" | "vlm_api_key" | "vlm_model" | "vlm_thinking" | "upscale_width" | "audiveris_args"
    ) {
        return Err(format!("未知设置项: {key}"));
    }
    state.db.set_setting(&key, &value).map_err(err)
}

/// 拉取 VLM 平台的模型列表（OpenAI 兼容 GET /models）
#[tauri::command]
pub async fn fetch_vlm_models(api_base: String, api_key: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::vlm::fetch_models(&api_base, &api_key))
        .await
        .map_err(err)?
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub data_dir: String,
    pub resource_dir: Option<String>,
    pub engine_found: bool,
    pub engine_path: Option<String>,
    pub vlm_configured: bool,
}

#[tauri::command]
pub fn get_app_info(state: Ctx) -> Result<AppInfo, String> {
    let engine = omr::resolve_engine(state.inner()).ok();
    Ok(AppInfo {
        data_dir: state.data_dir.to_string_lossy().into_owned(),
        resource_dir: state
            .resource_dir
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned()),
        engine_found: engine.is_some(),
        engine_path: engine.map(|c| c.launcher.to_string_lossy().into_owned()),
        vlm_configured: crate::vlm::load_config(state.inner().db.as_ref()).is_some(),
    })
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

/// 弹出保存对话框，返回用户选择的目标路径（未选择返回 None）。
/// 与 pick_import_files 同理：必须在后台线程阻塞等待。
#[tauri::command]
pub async fn pick_save_path(file_name: String, ext: String, app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = app
            .dialog()
            .file()
            .set_file_name(&file_name)
            .add_filter(&format!("{ext} 文件"), &[ext.as_str()])
            .blocking_pick_file();
        Ok(path
            .map(|p| p.into_path().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default())
            .filter(|s| !s.is_empty()))
    })
    .await
    .map_err(err)?
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

/// 测试 VLM 服务连通性（用当前表单值，不必先保存）
#[tauri::command]
pub async fn test_vlm_connection(
    api_base: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cfg = crate::vlm::VlmConfig {
            api_base: api_base.trim().trim_end_matches('/').to_string(),
            api_key: api_key.trim().to_string(),
            model: model.trim().to_string(),
            thinking: false, // 连通性测试与推理无关
        };
        crate::vlm::ping(&cfg)
    })
    .await
    .map_err(err)?
}

/// 读取识别任务的引擎日志
#[tauri::command]
pub fn read_job_log(job_id: String, state: Ctx) -> Result<Option<String>, String> {
    let job = state
        .db
        .get_job(&job_id)
        .map_err(err)?
        .ok_or_else(|| "任务不存在".to_string())?;
    let log_path = state
        .data_dir
        .join("scores")
        .join(&job.score_id)
        .join(format!("job-{job_id}.log"));
    if !log_path.exists() {
        return Ok(None);
    }
    Some(std::fs::read_to_string(&log_path).map_err(err)).transpose()
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
