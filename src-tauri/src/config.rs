use crate::db::{open_custom_db, open_db_at, DbState};
use crate::libraries::migrate_legacy_saved_libraries;
use crate::paths::{prepare_data_dir, resolve_config_dir};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbConfig {
    pub local_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbInfo {
    pub local_path: Option<String>,
    pub current_path: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn get_db_info(app: tauri::AppHandle, state: tauri::State<'_, DbState>) -> Result<DbInfo, String> {
    let config_path = resolve_config_dir(&app).join("db_config.json");
    let local_path = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap_or_default();
        let config: DbConfig =
            serde_json::from_str(&content).unwrap_or(DbConfig { local_path: None });
        config.local_path
    } else {
        None
    };

    let current_path = state.db_path.lock().map_err(|e| e.to_string())?.clone();
    let default_path = prepare_data_dir(&app)
        .join("drawx.db")
        .to_string_lossy()
        .to_string();
    let is_default = local_path.is_none() || current_path == default_path;

    Ok(DbInfo {
        local_path,
        current_path,
        is_default,
    })
}

#[tauri::command]
pub fn get_db_config(app: tauri::AppHandle) -> Result<DbConfig, String> {
    let config_path = resolve_config_dir(&app).join("db_config.json");

    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let config: DbConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(config)
    } else {
        Ok(DbConfig { local_path: None })
    }
}

#[tauri::command]
pub fn set_db_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    config: DbConfig,
) -> Result<DbInfo, String> {
    let custom_path = config
        .local_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty());

    let (conn, db_path) = match custom_path {
        Some(path) => {
            let p = std::path::Path::new(path);
            let conn = open_custom_db(path)?;
            migrate_legacy_saved_libraries(&app, &conn);
            (conn, p.to_path_buf())
        }
        None => {
            let default_path = prepare_data_dir(&app).join("drawx.db");
            let conn = open_db_at(&default_path)?;
            migrate_legacy_saved_libraries(&app, &conn);
            (conn, default_path)
        }
    };

    let config_dir = resolve_config_dir(&app);
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_path = config_dir.join("db_config.json");
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;

    let mut conn_guard = state.conn.lock().map_err(|e| e.to_string())?;
    *conn_guard = conn;
    let mut db_path_guard = state.db_path.lock().map_err(|e| e.to_string())?;
    *db_path_guard = db_path.to_string_lossy().to_string();

    let default_path_str = prepare_data_dir(&app)
        .join("drawx.db")
        .to_string_lossy()
        .to_string();
    let is_default = custom_path.is_none() || *db_path_guard == default_path_str;

    Ok(DbInfo {
        local_path: config.local_path,
        current_path: db_path_guard.clone(),
        is_default,
    })
}

#[tauri::command]
pub async fn select_local_db_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_title("Choose Existing SQLite Database")
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file();

    Ok(file_path
        .map(|path| path.into_path().map_err(|e| e.to_string()))
        .transpose()?
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn create_new_db_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_title("Create New SQLite Database")
        .add_filter("SQLite Database", &["db", "sqlite", "sqlite3"])
        .set_file_name("drawx.db")
        .blocking_save_file();

    Ok(file_path
        .map(|path| path.into_path().map_err(|e| e.to_string()))
        .transpose()?
        .map(|path| path.to_string_lossy().to_string()))
}
