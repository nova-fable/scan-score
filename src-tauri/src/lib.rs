pub mod commands;
pub mod db;
pub mod import;
pub mod model;
pub mod mxl;
pub mod omr;
pub mod pdf;
pub mod vlm;

use std::sync::Arc;

use omr::{AppState, OmrQueue};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("无法确定应用数据目录");
            std::fs::create_dir_all(data_dir.join("scores")).ok();
            std::fs::create_dir_all(data_dir.join("covers")).ok();

            let db_path = data_dir.join("library.db");
            let db = db::Db::open(&db_path).expect("无法打开曲库数据库");

            let resource_dir = app.path().resource_dir().ok();

            let state = Arc::new(AppState {
                db: Arc::new(db),
                data_dir,
                resource_dir,
                app_handle: app.handle().clone(),
                queue: Arc::new(OmrQueue::new()),
            });

            // 启动识别任务 worker
            let worker_state = Arc::clone(&state);
            let queue = Arc::clone(&state.queue);
            queue.spawn_worker(worker_state);

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_import_files,
            commands::pick_import_folder,
            commands::list_folder_scores,
            commands::import_files,
            commands::import_merged,
            commands::list_scores,
            commands::get_score,
            commands::update_score,
            commands::delete_score,
            commands::read_score_asset,
            commands::start_recognition,
            commands::cancel_recognition,
            commands::list_jobs,
            commands::get_settings,
            commands::set_setting,
            commands::get_app_info,
            commands::pick_save_path,
            commands::write_export_bytes,
            commands::export_score_source,
            commands::emit_test_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
