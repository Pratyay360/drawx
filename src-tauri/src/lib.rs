use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

struct DbState {
    conn: Mutex<Connection>,
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
        year, month, day, h, m, s,
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
    let conn = Connection::open(db_path).expect("failed to open database");

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
         );",
    )
    .expect("failed to initialize database");

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
            })
        })
        .map_err(|e| e.to_string())?;

    let canvases: Vec<Canvas> = rows.filter_map(|r| r.ok()).collect();
    Ok(canvases)
}

#[tauri::command]
fn create_canvas(
    state: tauri::State<'_, DbState>,
    title: String,
) -> Result<Canvas, String> {
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
fn load_canvas(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<Canvas>, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = init_db(app.handle());
            app.manage(DbState {
                conn: Mutex::new(conn),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
