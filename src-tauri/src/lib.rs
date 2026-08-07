use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

struct DbState {
    conn: Mutex<Connection>,
    db_path: Mutex<String>,
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
    files: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Library {
    id: String,
    name: String,
    description: String,
    authors: Vec<serde_json::Value>,
    source: String,
    preview: String,
    created: String,
    updated: String,
    version: i64,
    item_names: Option<Vec<String>>,
    content: Option<serde_json::Value>,
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

fn init_db(app: &tauri::AppHandle) -> Connection {
    let app_dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
    let db_path = app_dir.join("drawx.db");

    let conn = Connection::open(&db_path).expect("failed to open database");

    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS canvases (
             id TEXT PRIMARY KEY,
             title TEXT NOT NULL,
             description TEXT,
             elements TEXT NOT NULL DEFAULT '[]',
             app_state TEXT NOT NULL DEFAULT '{}',
             files TEXT NOT NULL DEFAULT '{}',
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS libraries (
             id TEXT PRIMARY KEY,
             name TEXT NOT NULL,
             description TEXT NOT NULL DEFAULT '',
             authors TEXT NOT NULL DEFAULT '[]',
             source TEXT NOT NULL DEFAULT '',
             preview TEXT NOT NULL DEFAULT '',
             created TEXT NOT NULL DEFAULT '',
             updated TEXT NOT NULL DEFAULT '',
             version INTEGER NOT NULL DEFAULT 0,
             item_names TEXT,
             content TEXT
         );",
    )
    .expect("failed to initialize database");

    // Migrate pre-existing databases that lack the `files` column.
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(canvases)")
        .and_then(|mut stmt| stmt.query_map([], |row| row.get::<_, String>(1)))
        .and_then(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    if !columns.iter().any(|c| c == "files") {
        conn.execute_batch("ALTER TABLE canvases ADD COLUMN files TEXT NOT NULL DEFAULT '{}'")
            .expect("failed to migrate canvases table");
    }

    conn
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
                // `files` is intentionally not selected in the list view to keep
                // the payload lean (images are large base64 blobs).
                files: serde_json::Value::Null,
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
        files: serde_json::json!({}),
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
        "SELECT id, title, description, elements, app_state, files, created_at, updated_at FROM canvases WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let elements_json: String = row.get(3)?;
            let app_state_json: String = row.get(4)?;
            let files_json: String = row.get(5)?;
            let created_at: String = row.get(6)?;
            let updated_at: String = row.get(7)?;

            let elements: Vec<serde_json::Value> =
                serde_json::from_str(&elements_json).unwrap_or_default();
            let app_state: serde_json::Value =
                serde_json::from_str(&app_state_json).unwrap_or_default();
            let files: serde_json::Value =
                serde_json::from_str(&files_json).unwrap_or_default();

            Ok(Canvas {
                id,
                title,
                description,
                created_at,
                updated_at,
                elements,
                app_state,
                files,
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
    files: serde_json::Value,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    let elements_json = serde_json::to_string(&elements).map_err(|e| e.to_string())?;
    let app_state_json = serde_json::to_string(&app_state).map_err(|e| e.to_string())?;
    let files_json = serde_json::to_string(&files).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE canvases SET elements = ?1, app_state = ?2, files = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![elements_json, app_state_json, files_json, now, id],
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

fn row_to_library(
    id: String,
    name: String,
    description: String,
    authors_json: String,
    source: String,
    preview: String,
    created: String,
    updated: String,
    version: i64,
    item_names: Option<String>,
    content: Option<String>,
) -> Result<Library, String> {
    let authors: Vec<serde_json::Value> =
        serde_json::from_str(&authors_json).unwrap_or_default();
    let item_names = item_names
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok());
    let content = content
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    Ok(Library {
        id,
        name,
        description,
        authors,
        source,
        preview,
        created,
        updated,
        version,
        item_names,
        content,
    })
}

#[tauri::command]
fn list_libraries(state: tauri::State<'_, DbState>) -> Result<Vec<Library>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, authors, source, preview, created, updated, version, item_names, content FROM libraries ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let libraries = rows
        .filter_map(|r| r.ok())
        .map(|(id, name, description, authors, source, preview, created, updated, version, item_names, content)| {
            row_to_library(
                id, name, description, authors, source, preview, created, updated, version, item_names, content,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(libraries)
}

#[tauri::command]
fn save_libraries(
    state: tauri::State<'_, DbState>,
    libraries: Vec<Library>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    for lib in &libraries {
        let authors = serde_json::to_string(&lib.authors).map_err(|e| e.to_string())?;
        let item_names = lib
            .item_names
            .as_ref()
            .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
            .transpose()?;
        let content = lib
            .content
            .as_ref()
            .map(|v| serde_json::to_string(v).map_err(|e| e.to_string()))
            .transpose()?;

        conn.execute(
            "INSERT INTO libraries (id, name, description, authors, source, preview, created, updated, version, item_names, content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                authors = excluded.authors,
                source = excluded.source,
                preview = excluded.preview,
                created = excluded.created,
                updated = excluded.updated,
                version = excluded.version,
                item_names = excluded.item_names,
                content = excluded.content",
            rusqlite::params![
                lib.id, lib.name, lib.description, authors, lib.source, lib.preview,
                lib.created, lib.updated, lib.version, item_names, content
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn clear_libraries(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM libraries", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_all_library_items(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT content FROM libraries WHERE content IS NOT NULL")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut all_items: Vec<serde_json::Value> = Vec::new();
    for row in rows {
        let json = row.map_err(|e| e.to_string())?;
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json) {
            if let Some(items) = value.get("libraryItems").and_then(|v| v.as_array()) {
                all_items.extend(items.iter().cloned());
            }
        }
    }

    Ok(all_items)
}

#[tauri::command]
fn get_db_path(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let path = state.db_path.lock().map_err(|e| e.to_string())?;
    Ok(path.clone())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = init_db(app.handle());
            let db_path = app
                .handle()
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("drawx.db")
                .to_string_lossy()
                .to_string();
            app.manage(DbState {
                conn: Mutex::new(conn),
                db_path: Mutex::new(db_path),
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
            list_libraries,
            save_libraries,
            clear_libraries,
            load_all_library_items,
            get_db_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
