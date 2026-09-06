mod canvas;
mod config;
mod db;
mod ids;
mod libraries;
mod paths;
mod time;
mod user_library;

use std::sync::Mutex;
use tauri::Manager;

use db::{init_db, DbState};
use paths::resolve_config_dir;

pub use config::{DbConfig, DbInfo};
pub use canvas::Canvas;
pub use libraries::SavedLibrary;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let config_path = resolve_config_dir(app.handle()).join("db_config.json");

            let custom_path = if config_path.exists() {
                let content = std::fs::read_to_string(&config_path).unwrap_or_default();
                let config: db::DbConfig =
                    serde_json::from_str(&content).unwrap_or(db::DbConfig { local_path: None });
                config.local_path
            } else {
                None
            };

            let (conn, db_path) = init_db(app.handle(), custom_path.as_deref());
            app.manage(DbState {
                conn: Mutex::new(conn),
                db_path: Mutex::new(db_path.to_string_lossy().to_string()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            canvas::list_canvases,
            canvas::create_canvas,
            canvas::delete_canvas,
            canvas::load_canvas,
            canvas::save_canvas,
            canvas::update_canvas_title,
            config::get_db_config,
            config::get_db_info,
            config::set_db_config,
            config::select_local_db_path,
            config::create_new_db_path,
            libraries::get_saved_libraries,
            libraries::save_library,
            libraries::save_library_content,
            libraries::remove_saved_library,
            user_library::get_user_library,
            user_library::set_user_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
