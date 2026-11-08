//! OMR 识别管线：Audiveris 引擎解析、批处理调用、串行任务队列。

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use thiserror::Error;
use tauri::Emitter;

use crate::db::Db;
use crate::model::{Job, OmrDoneEvent, OmrProgressEvent, Score};
use crate::mxl;
use crate::vlm;

#[derive(Debug, Error)]
pub enum OmrError {
    #[error("未找到识别引擎 Audiveris，请在设置中指定安装路径")]
    EngineNotFound,
    #[error("识别输入文件不存在")]
    InputMissing,
    #[error("识别完成但未产出 MusicXML")]
    NoOutput,
    #[error("识别结果没有有效音符——这很可能是六线谱（TAB）谱。开源 OMR 无法识别六线谱，请改用 Guitar Pro (.gp/.gp5) 文件导入，或在设置中配置 AI 六线谱识别（实验性）")]
    TabNotRecognized,
    #[error("AI 六线谱识别失败：{0}")]
    AiTabFailed(String),
    #[error("图片分辨率太低（谱线间距不足），自动放大后仍无法识别。请使用 300DPI 扫描件或更高清的图片")]
    LowResolution,
    #[error("任务已取消")]
    Canceled,
    #[error("进程异常退出: {0}")]
    Process(String),
    #[error("io 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("mxl 处理错误: {0}")]
    Mxl(#[from] mxl::MxlError),
}

/// 解析出的引擎启动器信息
#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub launcher: PathBuf,
}

pub struct AppState {
    pub db: Arc<Db>,
    pub data_dir: PathBuf,
    pub resource_dir: Option<PathBuf>,
    pub app_handle: tauri::AppHandle,
    pub queue: Arc<OmrQueue>,
}

/// 取消句柄：flag 由回调置位，watcher 线程观察到后杀掉子进程
pub struct CancelState {
    flag: AtomicBool,
    pid: Mutex<Option<u32>>,
}

impl CancelState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            flag: AtomicBool::new(false),
            pid: Mutex::new(None),
        })
    }
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
        // 立即尝试杀进程（watcher 兜底）
        if let Some(pid) = *self.pid.lock().unwrap() {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
        }
    }
    fn cancel_requested(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }
    /// 子进程是否仍存活（kill(pid,0) 探测）
    fn is_alive(&self) -> bool {
        match *self.pid.lock().unwrap() {
            Some(pid) => unsafe { libc::kill(pid as i32, 0) == 0 },
            None => true,
        }
    }
}

// ---------------------------------------------------------------------------
// 引擎解析与批处理
// ---------------------------------------------------------------------------

/// 引擎解析优先级：设置覆盖 > 打包资源 > 环境变量 > /Applications 安装位置
pub fn resolve_engine(state: &AppState) -> Result<EngineConfig, OmrError> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(Some(custom)) = state.db.get_setting("engine_path") {
        if !custom.trim().is_empty() {
            candidates.push(PathBuf::from(custom.trim()));
        }
    }
    if let Some(res) = &state.resource_dir {
        candidates.push(res.join("engine/Audiveris.app/Contents/MacOS/Audiveris"));
        candidates.push(res.join("engine/bin/Audiveris"));
    }
    if let Ok(env_path) = std::env::var("AUDIVERIS_CMD") {
        candidates.push(PathBuf::from(env_path));
    }
    candidates.push(PathBuf::from(
        "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
    ));

    let launcher = candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or(OmrError::EngineNotFound)?;
    Ok(EngineConfig { launcher })
}

/// 组装 Audiveris 批处理命令参数（5.11 实测验证：位置参数即可）
pub fn build_args(inputs: &[PathBuf], out_dir: &Path) -> Vec<String> {
    let mut args = vec![
        "-batch".to_string(),
        "-export".to_string(),
        "-output".to_string(),
        out_dir.to_string_lossy().into_owned(),
    ];
    for input in inputs {
        args.push(input.to_string_lossy().into_owned());
    }
    args
}

/// 识别输入预处理：低分辨率图片自动放大（Audiveris 要求谱线间距 ≥ 约12px，300DPI 最优）。
/// PDF 不处理（内部自带矢量信息）。放大失败时静默回退原图。
pub fn prepare_input(input: &Path) -> PathBuf {
    const MIN_WIDTH: u32 = 1600;
    const TARGET_WIDTH: u32 = 2400;
    let is_pdf = input
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase() == "pdf")
        .unwrap_or(false);
    if is_pdf {
        return input.to_path_buf();
    }
    let dims = image::image_dimensions(input);
    match dims {
        Ok((w, _)) if w < MIN_WIDTH => {
            let upscaled = input.with_extension("upscaled.png");
            let ok = std::process::Command::new("sips")
                .arg("--resampleWidth")
                .arg(TARGET_WIDTH.to_string())
                .arg(input)
                .arg("--out")
                .arg(&upscaled)
                .output()
                .map(|o| o.status.success() && upscaled.exists())
                .unwrap_or(false);
            if ok {
                log::info!("识别输入分辨率 {w}px 偏低，已放大至 {TARGET_WIDTH}px");
                upscaled
            } else {
                log::warn!("图片放大失败，用原图识别");
                input.to_path_buf()
            }
        }
        _ => input.to_path_buf(),
    }
}

/// 单次批处理执行：流式读取 stdout，回调进度；可取消（SIGTERM 子进程）。
/// 返回本次运行产出的 .mxl 文件列表（按 mtime ≥ 运行开始判定，兼容重跑覆盖同名文件的场景）。
pub fn run_batch(
    engine: &EngineConfig,
    inputs: &[PathBuf],
    out_dir: &Path,
    cancel: Arc<CancelState>,
    on_progress: impl Fn(i64, &str) + Send + 'static,
) -> Result<Vec<PathBuf>, OmrError> {
    for input in inputs {
        if !input.exists() {
            return Err(OmrError::InputMissing);
        }
    }
    let _ = std::fs::create_dir_all(out_dir);
    let run_started = std::time::SystemTime::now() - std::time::Duration::from_secs(2);

    // 引擎日志尾部环形缓冲（失败时附到错误信息里）
    let log_tail: Arc<Mutex<std::collections::VecDeque<String>>> =
        Arc::new(Mutex::new(std::collections::VecDeque::with_capacity(8)));
    let push_tail = |line: String, buf: &Arc<Mutex<std::collections::VecDeque<String>>>| {
        if let Ok(mut b) = buf.lock() {
            if b.len() == 8 {
                b.pop_front();
            }
            b.push_back(line);
        }
    };
    let tail_for_err = |buf: &Arc<Mutex<std::collections::VecDeque<String>>>| {
        buf.lock()
            .map(|b| b.iter().cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default()
    };

    let mut child: Child = Command::new(&engine.launcher)
        .args(build_args(inputs, out_dir))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| OmrError::Process(format!("启动失败: {e}")))?;

    *cancel.pid.lock().unwrap() = Some(child.id());

    // watcher: flag 置位后杀进程；进程自然退出后自行结束
    {
        let cancel_w = Arc::clone(&cancel);
        thread::spawn(move || loop {
            if cancel_w.flag.load(Ordering::SeqCst) {
                if let Some(pid) = *cancel_w.pid.lock().unwrap() {
                    unsafe {
                        libc::kill(pid as i32, libc::SIGTERM);
                    }
                }
                break;
            }
            if !cancel_w.is_alive() {
                break;
            }
            thread::sleep(Duration::from_millis(150));
        });
    }

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let tail_out = Arc::clone(&log_tail);
    let reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            push_tail(line.clone(), &tail_out);
            // 粗粒度进度：处理中的步骤日志 → 50；导出 → 95
            let progress = if line.contains("Exporting") || line.contains("Exported") {
                95
            } else if line.contains("Sheet") {
                50
            } else {
                0
            };
            if progress > 0 {
                on_progress(progress, &line);
            }
        }
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            log::warn!("[audiveris:err] {line}");
            push_tail(line, &tail_out);
        }
    });

    let status = child.wait()?;
    let _ = reader.join();

    if !status.success() {
        let tail = tail_for_err(&log_tail);
        if cancel.cancel_requested() {
            return Err(OmrError::Canceled);
        }
        // 分辨率不足的典型特征
        if tail.contains("resolution is too low") || tail.contains("too low interline") {
            return Err(OmrError::LowResolution);
        }
        return Err(OmrError::Process(format!(
            "Audiveris 退出码 {:?}\n引擎日志尾部:\n{tail}",
            status.code()
        )));
    }

    let produced: Vec<PathBuf> = snapshot_mxl(out_dir)
        .into_iter()
        .filter_map(|(p, m)| if m >= run_started { Some(p) } else { None })
        .collect();
    if produced.is_empty() {
        // 正常退出但没导出：常见于转写失败（如 Sheet ignored），日志里通常有原因
        let tail = tail_for_err(&log_tail);
        if tail.contains("resolution is too low") || tail.contains("too low interline") {
            return Err(OmrError::LowResolution);
        }
        if !tail.is_empty() {
            return Err(OmrError::Process(format!(
                "Audiveris 未能导出\n引擎日志尾部:\n{tail}"
            )));
        }
        return Err(OmrError::NoOutput);
    }
    Ok(produced)
}

/// 列出目录内的 .mxl 及其修改时间
fn snapshot_mxl(dir: &Path) -> Vec<(PathBuf, std::time::SystemTime)> {
    let mut set = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "mxl").unwrap_or(false) {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(mtime) = meta.modified() {
                        set.push((path, mtime));
                    }
                }
            }
        }
    }
    set
}

// ---------------------------------------------------------------------------
// 任务队列：串行 worker，DB 为唯一事实来源，Condvar 通知唤醒。
// ---------------------------------------------------------------------------

pub struct OmrQueue {
    signal: Mutex<()>,
    cond: Condvar,
    current_canceled: Mutex<Option<String>>,
}

impl OmrQueue {
    pub fn new() -> Self {
        Self {
            signal: Mutex::new(()),
            cond: Condvar::new(),
            current_canceled: Mutex::new(None),
        }
    }

    /// 唤醒 worker（有新任务入队）
    pub fn notify(&self) {
        self.cond.notify_all();
    }

    /// 请求取消当前任务（只对正在运行的任务有效）
    pub fn request_cancel(&self, job_id: &str) {
        let mut guard = self.current_canceled.lock().unwrap();
        *guard = Some(job_id.to_string());
    }

    fn is_cancel_requested(&self, job_id: &str) -> bool {
        let guard = self.current_canceled.lock().unwrap();
        guard.as_deref() == Some(job_id)
    }

    fn clear_cancel(&self, job_id: &str) {
        let mut guard = self.current_canceled.lock().unwrap();
        if guard.as_deref() == Some(job_id) {
            *guard = None;
        }
    }

    /// 启动常驻 worker 线程
    pub fn spawn_worker(self: Arc<Self>, state: Arc<AppState>) {
        thread::spawn(move || loop {
            let guard = self.signal.lock().unwrap();
            let _ = self.cond.wait_timeout(guard, Duration::from_secs(15)).unwrap();

            loop {
                match run_next_job(&state) {
                    Ok(true) => continue, // 处理完一个，继续下一个
                    Ok(false) => break,   // 队列空
                    Err(e) => {
                        log::error!("识别任务执行失败: {e}");
                        break;
                    }
                }
            }
        });
    }
}

/// 取出并执行一个待处理任务；队列空返回 false
fn run_next_job(state: &Arc<AppState>) -> Result<bool, OmrError> {
    let Some(job) = state.db.next_queued_job()? else {
        return Ok(false);
    };
    state.queue.clear_cancel(&job.id);

    let Some(score) = state.db.get_score(&job.score_id)? else {
        state
            .db
            .update_job(&job.id, "failed", 0, Some("曲谱条目已不存在"))?;
        return Ok(true);
    };

    emit_progress(state, &job, "running", 5, Some("启动识别引擎"));
    state
        .db
        .update_job(&job.id, "running", 5, Some("启动识别引擎"))?;
    state
        .db
        .update_score_status(&score.id, "processing", None)?;

    let cancel = CancelState::new();
    let result = execute_job(state, &job, &score, Arc::clone(&cancel));

    match result {
        Ok(_mxl_path) => {
            emit_progress(state, &job, "done", 100, Some("识别完成"));
            state.db.update_job(&job.id, "done", 100, None)?;
            let updated = state.db.get_score(&score.id)?;
            emit_done(state, &job, true, updated, None);
        }
        Err(e) => {
            let msg = e.to_string();
            let (job_state, score_state) = if matches!(e, OmrError::Canceled) {
                ("canceled", "imported")
            } else {
                ("failed", "failed")
            };
            state.db.update_job(&job.id, job_state, 0, Some(&msg))?;
            state
                .db
                .update_score_status(&score.id, score_state, Some(&msg))?;
            let updated = state.db.get_score(&score.id)?;
            emit_done(state, &job, false, updated, Some(msg));
        }
    }
    Ok(true)
}

/// 执行单个识别任务：跑引擎 → 解包 mxl → 解析元数据 → 更新曲库
fn execute_job(
    state: &Arc<AppState>,
    job: &Job,
    score: &Score,
    cancel: Arc<CancelState>,
) -> Result<PathBuf, OmrError> {
    let engine = resolve_engine(state)?;
    let raw_input = PathBuf::from(
        score
            .original_path
            .as_ref()
            .ok_or(OmrError::InputMissing)?,
    );
    // 低分辨率图片自动放大后再送识别
    let input = prepare_input(&raw_input);
    let out_dir = state.data_dir.join("scores").join(&score.id);

    let db = Arc::clone(&state.db);
    let app = state.app_handle.clone();
    let job_id = job.id.clone();
    let score_id = job.score_id.clone();
    let queue = Arc::clone(&state.queue);
    let cancel_for_cb = Arc::clone(&cancel);

    let produced = run_batch(&engine, std::slice::from_ref(&input), &out_dir, cancel, move |progress, line| {
        log::info!("[audiveris] {line}");
        let _ = db.update_job(&job_id, "running", progress, Some(line));
        let _ = app.emit(
            "omr://progress",
            OmrProgressEvent {
                job_id: job_id.clone(),
                score_id: score_id.clone(),
                state: "running".into(),
                progress,
                message: Some(line.to_string()),
            },
        );
        if queue.is_cancel_requested(&job_id) {
            cancel_for_cb.cancel();
        }
    })?;

    // 取第一个产出的 .mxl（单输入通常只有一个）
    let mxl_path = produced.first().ok_or(OmrError::NoOutput)?.clone();

    // 解包 + 元数据 → 更新曲库
    let xml_text = mxl::load_musicxml_text(&mxl_path)?;
    let score_xml_path = out_dir.join("score.xml");
    std::fs::write(&score_xml_path, &xml_text)?;
    let meta = mxl::parse_meta(&xml_text)?;

    // 六线谱（TAB）检出：优先尝试云端多模态识别（若已配置），否则报错提示
    if mxl::count_pitched_notes(&xml_text) < 10 {
        log::info!("识别结果几乎无音符，疑似六线谱输入");
        if let Some(cfg) = vlm::load_config(&state.db) {
            let msg = if cfg.thinking {
                "六线谱检出，AI 识别中（推理模式约需 1-5 分钟）…"
            } else {
                "六线谱检出，尝试 AI 识别…"
            };
            state.db.update_job(&job.id, "running", 60, Some(msg))?;
            let _ = state.app_handle.emit(
                "omr://progress",
                OmrProgressEvent {
                    job_id: job.id.clone(),
                    score_id: score.id.clone(),
                    state: "running".into(),
                    progress: 60,
                    message: Some(msg.into()),
                },
            );
            match vlm::transcribe_tab(&raw_input, &cfg) {
                Ok(tex) if vlm::looks_like_alpha_tex(&tex) => {
                    let atx_path = out_dir.join("score.atx");
                    std::fs::write(&atx_path, &tex)?;
                    state.db.update_score_recognition(
                        &score.id,
                        &atx_path.to_string_lossy(),
                        "guitar",
                        None,
                        None,
                    )?;
                    log::info!("AI 六线谱识别成功 (alphaTex {} 字符)", tex.len());
                    return Ok(atx_path);
                }
                Ok(_) => {
                    log::warn!("AI 输出不像 alphaTex，按失败处理");
                    return Err(OmrError::TabNotRecognized);
                }
                Err(e) => {
                    log::warn!("AI 六线谱识别失败: {e}");
                    return Err(OmrError::AiTabFailed(e));
                }
            }
        }
        return Err(OmrError::TabNotRecognized);
    }

    let instrument = if meta.part_count <= 1 { "piano" } else { "other" };

    state.db.update_score_recognition(
        &score.id,
        &score_xml_path.to_string_lossy(),
        instrument,
        meta.title.as_deref(),
        meta.composer.as_deref(),
    )?;
    Ok(mxl_path)
}

fn emit_progress(state: &Arc<AppState>, job: &Job, state_name: &str, progress: i64, message: Option<&str>) {
    let _ = state.app_handle.emit(
        "omr://progress",
        OmrProgressEvent {
            job_id: job.id.clone(),
            score_id: job.score_id.clone(),
            state: state_name.to_string(),
            progress,
            message: message.map(|m| m.to_string()),
        },
    );
}

fn emit_done(state: &Arc<AppState>, job: &Job, ok: bool, score: Option<Score>, error: Option<String>) {
    let _ = state.app_handle.emit(
        "omr://done",
        OmrDoneEvent {
            job_id: job.id.clone(),
            score_id: job.score_id.clone(),
            ok,
            score,
            error,
        },
    );
}
