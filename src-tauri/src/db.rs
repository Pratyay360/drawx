use std::sync::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::paths::{prepare_data_dir, resolve_config_dir};

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub db_path: Mutex<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbConfig {
    pub local_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(dead_code)]
pub struct DbInfo {
    pub local_path: Option<String>,
    pub current_path: String,
    pub is_default: bool,
}

pub fn open_db_at(db_path: &std::path::Path) -> Result<Connection, String> {
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

pub fn open_custom_db(path: &str) -> Result<Connection, String> {
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

pub fn clear_stale_db_config(app: &tauri::AppHandle) {
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

pub fn init_db(app: &tauri::AppHandle, custom_path: Option<&str>) -> (Connection, std::path::PathBuf) {
    let custom_path = custom_path.map(str::trim).filter(|p| !p.is_empty());

    if let Some(path) = custom_path {
        match open_custom_db(path) {
            Ok(conn) => {
                crate::libraries::migrate_legacy_saved_libraries(app, &conn);
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
    crate::libraries::migrate_legacy_saved_libraries(app, &conn);
    (conn, db_path)
}
