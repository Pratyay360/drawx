use serde::{Deserialize, Serialize};
use crate::db::DbState;
use crate::paths::resolve_config_dir;
use crate::time::now_iso;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedLibrary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub authors: serde_json::Value,
    pub source: String,
    pub preview: String,
    pub created: String,
    pub updated: String,
    pub version: i32,
    pub item_names: serde_json::Value,
    #[serde(default)]
    pub items: serde_json::Value,
    #[serde(default)]
    pub fetched_at: Option<String>,
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

pub const LIBRARY_COLUMNS: &str =
    "id, name, description, authors, source, preview, created, updated, version, item_names, items, fetched_at";

pub fn migrate_legacy_saved_libraries(app: &tauri::AppHandle, conn: &rusqlite::Connection) {
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
pub fn get_saved_libraries(state: tauri::State<'_, DbState>) -> Result<Vec<SavedLibrary>, String> {
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

#[tauri::command]
pub fn save_library(state: tauri::State<'_, DbState>, library: SavedLibrary) -> Result<(), String> {
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
pub fn save_library_content(
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
pub fn remove_saved_library(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM libraries WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
