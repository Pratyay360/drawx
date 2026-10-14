mod canvas;
mod config;
mod db;
mod ids;
mod libraries;
pub mod mcp;
mod paths;
mod time;
mod user_library;

use std::sync::Mutex;
use tauri::Manager;

use db::{init_db, DbState};
use paths::resolve_config_dir;
use tauri_plugin_sentry::Sentry;

pub use canvas::Canvas;
pub use config::{DbConfig, DbInfo};
pub use libraries::SavedLibrary;
pub use mcp::{McpState, DEFAULT_MCP_PORT};

const SENTRY_DSN: &str = "https://41990cc48e061c70a5a043e635b63eb6@o4510758181208064.ingest.de.sentry.io/4512250072268880";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sentry_plugin = Sentry::new();

    let options = sentry::ClientOptions::new()
        .add_integration(sentry_plugin.clone())
        .dsn(SENTRY_DSN.parse().ok())
        .maybe_release(sentry::release_name!())
        .auto_session_tracking(true);

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    let options =
        options.add_integration(sentry::integrations::minidump::MinidumpIntegration::new());

    // Caution! Everything before here runs in both app and crash reporter
    // processes. Everything after here runs in only the app process.
    let _guard = sentry::init(options);
    // Everything after here runs in only the app process.

    tauri::Builder::default()
        .plugin(sentry_plugin)
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

            let mcp_state = mcp::McpState::new(app.handle().clone());
            let mcp_server_state = mcp_state.clone();
            std::thread::spawn(move || {
                mcp::start_mcp_server(mcp_server_state, mcp::DEFAULT_MCP_PORT);
            });
            app.manage(mcp_state);

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
            mcp::sync_active_canvas,
            mcp::get_mcp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
