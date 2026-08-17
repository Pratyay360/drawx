use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub db_path: Mutex<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DbConfig {
    local_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DbInfo {
    local_path: Option<String>,
    current_path: String,
    is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SavedLibrary {
    id: String,
    name: String,
    description: String,
    authors: serde_json::Value,
    source: String,
    preview: String,
    created: String,
    updated: String,
    version: i32,
    item_names: serde_json::Value,
    #[serde(default)]
    items: serde_json::Value,
    #[serde(default)]
    fetched_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Canvas {
    id: String,
    title: String,
    description: Option<String>,
    created_at: String,
    updated_at: String,
    elements: Vec<serde_json::Value>,
    app_state: serde_json::Value,
}

fn now_iso() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs();
    let nanos = dur.subsec_nanos();

    let z = (total_secs / 86400) as i64;
    let tod = total_secs % 86400;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;

    let (year, month, day) = civil_from_days(z);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year,
        month,
        day,
        h,
        m,
        s,
        nanos / 1_000_000
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m as u32, d as u32)
}

fn generate_canvas_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("c_{:x}", nanos)
}

fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var("HOME")
        .ok()
        .filter(|home| !home.trim().is_empty())
        .map(std::path::PathBuf::from)
}

fn config_dir_base() -> std::path::PathBuf {
    match std::env::var("XDG_CONFIG_HOME") {
        Ok(dir) if !dir.trim().is_empty() => std::path::PathBuf::from(dir),
        _ => match home_dir() {
            Some(home) => home.join(".config"),
            None => std::env::temp_dir(),
        },
    }
}

/// Best-effort app config dir. Never fails (mirrors the data dir approach).
fn resolve_config_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(_) => config_dir_base().join(&app.config().identifier),
    }
}

fn prepare_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let preferred = resolve_config_dir(app);
    match std::fs::create_dir_all(&preferred) {
        Ok(_) => preferred,
        Err(err) => {
            eprintln!(
                "warning: could not create app data dir at {:?}: {err}; using temp dir",
                preferred
            );
            let fallback = std::env::temp_dir().join(&app.config().identifier);
            std::fs::create_dir_all(&fallback).expect("failed to create fallback data dir");
            fallback
        }
    }
}
fn init_db(app: &tauri::AppHandle, custom_path: Option<&str>) -> (Connection, std::path::PathBuf) {
    let custom_path = custom_path.map(str::trim).filter(|p| !p.is_empty());

    if let Some(path) = custom_path {
        match open_custom_db(path) {
            Ok(conn) => {
                migrate_legacy_saved_libraries(app, &conn);
                return (conn, std::path::PathBuf::from(path));
            }
            Err(err) => {
                eprintln!(
                    "warning: configured database at {path:?} is unavailable ({err}); \
                     falling back to the default location"
                );
                clear_stale_db_config(app);
            }
        }
    }

    let db_path = prepare_data_dir(app).join("drawx.db");
    let conn = open_db_at(&db_path).unwrap_or_else(|err| {
        panic!(
            "failed to open database in default location {:?}: {err}",
            db_path
        )
    });
    migrate_legacy_saved_libraries(app, &conn);
    (conn, db_path)
}

fn open_db_at(db_path: &std::path::Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("could not create dir {parent:?}: {err}"))?;
    }

    let conn = Connection::open(db_path).map_err(|err| format!("could not open file: {err}"))?;

    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS canvases (
             id TEXT PRIMARY KEY,
             title TEXT NOT NULL,
             description TEXT,
             elements TEXT NOT NULL DEFAULT '[]',
             app_state TEXT NOT NULL DEFAULT '{}',
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS libraries (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL DEFAULT '',
             description TEXT NOT NULL DEFAULT '',
             authors TEXT NOT NULL DEFAULT '[]',
             source TEXT NOT NULL DEFAULT '',
             preview TEXT NOT NULL DEFAULT '',
             created TEXT NOT NULL DEFAULT '',
             updated TEXT NOT NULL DEFAULT '',
             version INTEGER NOT NULL DEFAULT 0,
             item_names TEXT NOT NULL DEFAULT '[]',
             items TEXT NOT NULL DEFAULT '[]',
             fetched_at TEXT
         );
         CREATE TABLE IF NOT EXISTS user_library (
             id INTEGER PRIMARY KEY CHECK (id = 1),
             items TEXT NOT NULL DEFAULT '[]',
             updated_at TEXT
         );
",
    )
    .map_err(|err| format!("could not initialize schema: {err}"))?;

    Ok(conn)
}

/// Try to open the database at `path` on a worker thread with a short timeout
/// so a stale or slow location (unmounted drive, dead network share, ...)
/// can't hang app startup — it just falls back to the default data dir.
fn open_custom_db(path: &str) -> Result<Connection, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let target = path.to_string();
    let spawned = std::thread::Builder::new().spawn(move || {
        let _ = tx.send(open_db_at(std::path::Path::new(&target)));
    });
    if spawned.is_err() {
        return Err("could not spawn worker thread".into());
    }
    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(result) => result,
        Err(_) => Err("timed out".into()),
    }
}

/// The configured custom location couldn't be used — clear it so we don't
/// stall on it every launch and the settings UI shows the real location.
fn clear_stale_db_config(app: &tauri::AppHandle) {
    let config_path = resolve_config_dir(app).join("db_config.json");
    let content = match std::fs::read_to_string(&config_path) {
        Ok(content) => content,
        Err(_) => return,
    };
    let mut config: DbConfig = match serde_json::from_str(&content) {
        Ok(config) => config,
        Err(_) => return,
    };
    if config.local_path.is_none() {
        return;
    }
    config.local_path = None;
    let _ = std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&config).unwrap_or_else(|_| "{\"local_path\": null}".into()),
    );
}

/// Import the old `saved_libraries.json` config file into the database (once),
/// then remove it so the DB becomes the single source of truth.
fn migrate_legacy_saved_libraries(app: &tauri::AppHandle, conn: &Connection) {
    let config_dir = resolve_config_dir(app);
    let path = config_dir.join("saved_libraries.json");
    if !path.exists() {
        return;
    }
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => return,
    };
    let libraries: Vec<SavedLibrary> = match serde_json::from_str(&content) {
        Ok(libraries) => libraries,
        Err(_) => return,
    };
    let existing: i64 = conn
        .query_row("SELECT COUNT(*) FROM libraries", [], |row| row.get(0))
        .unwrap_or(0);
    if existing > 0 {
        return;
    }
    for library in libraries {
        let _ = conn.execute(
            "INSERT OR IGNORE INTO libraries
                (id, name, description, authors, source, preview, created, updated, version, item_names, items, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '[]', NULL)",
            rusqlite::params![
                library.id,
                library.name,
                library.description,
                serde_json::to_string(&library.authors).unwrap_or_else(|_| "[]".into()),
                library.source,
                library.preview,
                library.created,
                library.updated,
                library.version,
                serde_json::to_string(&library.item_names).unwrap_or_else(|_| "[]".into()),
            ],
        );
    }
    let _ = std::fs::remove_file(&path);
}

#[tauri::command]
fn list_canvases(state: tauri::State<'_, DbState>) -> Result<Vec<Canvas>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, description, elements, app_state, created_at, updated_at FROM canvases ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let elements_json: String = row.get(3)?;
            let app_state_json: String = row.get(4)?;
            let created_at: String = row.get(5)?;
            let updated_at: String = row.get(6)?;

            let elements: Vec<serde_json::Value> =
                serde_json::from_str(&elements_json).unwrap_or_default();
            let app_state: serde_json::Value =
                serde_json::from_str(&app_state_json).unwrap_or_default();

            Ok(Canvas {
                id,
                title,
                description,
                created_at,
                updated_at,
                elements,
                app_state,
            })
        })
        .map_err(|e| e.to_string())?;

    let canvases: Vec<Canvas> = rows.filter_map(|r| r.ok()).collect();
    Ok(canvases)
}

#[tauri::command]
fn create_canvas(state: tauri::State<'_, DbState>, title: String) -> Result<Canvas, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    let id = generate_canvas_id();

    conn.execute(
        "INSERT INTO canvases (id, title, description, elements, app_state, created_at, updated_at) VALUES (?1, ?2, NULL, '[]', '{}', ?3, ?3)",
        rusqlite::params![id, title, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Canvas {
        id,
        title,
        description: None,
        created_at: now.clone(),
        updated_at: now,
        elements: Vec::new(),
        app_state: serde_json::json!({}),
    })
}

#[tauri::command]
fn delete_canvas(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM canvases WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_canvas(state: tauri::State<'_, DbState>, id: String) -> Result<Option<Canvas>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, title, description, elements, app_state, created_at, updated_at FROM canvases WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let elements_json: String = row.get(3)?;
            let app_state_json: String = row.get(4)?;
            let created_at: String = row.get(5)?;
            let updated_at: String = row.get(6)?;

            let elements: Vec<serde_json::Value> =
                serde_json::from_str(&elements_json).unwrap_or_default();
            let app_state: serde_json::Value =
                serde_json::from_str(&app_state_json).unwrap_or_default();

            Ok(Canvas {
                id,
                title,
                description,
                created_at,
                updated_at,
                elements,
                app_state,
            })
        },
    );

    match result {
        Ok(canvas) => Ok(Some(canvas)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_canvas(
    state: tauri::State<'_, DbState>,
    id: String,
    elements: Vec<serde_json::Value>,
    app_state: serde_json::Value,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    let elements_json = serde_json::to_string(&elements).map_err(|e| e.to_string())?;
    let app_state_json = serde_json::to_string(&app_state).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE canvases SET elements = ?1, app_state = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![elements_json, app_state_json, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_canvas_title(
    state: tauri::State<'_, DbState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();

    conn.execute(
        "UPDATE canvases SET title = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![title, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_db_info(app: tauri::AppHandle, state: tauri::State<'_, DbState>) -> Result<DbInfo, String> {
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
fn get_db_config(app: tauri::AppHandle) -> Result<DbConfig, String> {
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
fn set_db_config(
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
            // Use the timeout-guarded open so a stale/slow path (unmounted drive,
            // dead network share) returns an error within 5 s instead of hanging.
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

fn read_library_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedLibrary> {
    let authors: String = row.get(3)?;
    let item_names: String = row.get(9)?;
    let items: String = row.get(10)?;
    Ok(SavedLibrary {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        authors: serde_json::from_str(&authors).unwrap_or_else(|_| serde_json::json!([])),
        source: row.get(4)?,
        preview: row.get(5)?,
        created: row.get(6)?,
        updated: row.get(7)?,
        version: row.get(8)?,
        item_names: serde_json::from_str(&item_names).unwrap_or_else(|_| serde_json::json!([])),
        items: serde_json::from_str(&items).unwrap_or_else(|_| serde_json::json!([])),
        fetched_at: row.get(11)?,
    })
}

const LIBRARY_COLUMNS: &str =
    "id, name, description, authors, source, preview, created, updated, version, item_names, items, fetched_at";

#[tauri::command]
fn get_saved_libraries(state: tauri::State<'_, DbState>) -> Result<Vec<SavedLibrary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {LIBRARY_COLUMNS} FROM libraries ORDER BY updated DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], read_library_row)
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

// Bookmarks library metadata only; `items`/`fetched_at` are managed
// separately via `save_library_content` and are preserved on conflict.
#[tauri::command]
fn save_library(state: tauri::State<'_, DbState>, library: SavedLibrary) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO libraries
            (id, name, description, authors, source, preview, created, updated, version, item_names, items, fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '[]', NULL)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            authors = excluded.authors,
            source = excluded.source,
            preview = excluded.preview,
            created = excluded.created,
            updated = excluded.updated,
            version = excluded.version,
            item_names = excluded.item_names",
        rusqlite::params![
            library.id,
            library.name,
            library.description,
            serde_json::to_string(&library.authors).map_err(|e| e.to_string())?,
            library.source,
            library.preview,
            library.created,
            library.updated,
            library.version,
            serde_json::to_string(&library.item_names).map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_library_content(
    state: tauri::State<'_, DbState>,
    id: String,
    item_names: serde_json::Value,
    items: serde_json::Value,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE libraries SET item_names = ?1, items = ?2, fetched_at = ?3 WHERE id = ?4",
        rusqlite::params![
            serde_json::to_string(&item_names).map_err(|e| e.to_string())?,
            serde_json::to_string(&items).map_err(|e| e.to_string())?,
            now,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_saved_library(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM libraries WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_user_library(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row("SELECT items FROM user_library WHERE id = 1", [], |row| {
        row.get::<_, String>(0)
    });
    match result {
        Ok(json) => Ok(serde_json::from_str(&json).unwrap_or_default()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Vec::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_user_library(
    state: tauri::State<'_, DbState>,
    items: Vec<serde_json::Value>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&items).map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "INSERT INTO user_library (id, items, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at",
        rusqlite::params![json, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn select_local_db_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
async fn create_new_db_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
                let config: DbConfig =
                    serde_json::from_str(&content).unwrap_or(DbConfig { local_path: None });
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
            list_canvases,
            create_canvas,
            delete_canvas,
            load_canvas,
            save_canvas,
            update_canvas_title,
            get_db_config,
            get_db_info,
            set_db_config,
            select_local_db_path,
            create_new_db_path,
            get_saved_libraries,
            save_library,
            save_library_content,
            remove_saved_library,
            get_user_library,
            set_user_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
