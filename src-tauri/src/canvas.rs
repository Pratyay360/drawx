use serde::{Deserialize, Serialize};

use crate::db::DbState;
use crate::time::now_iso;
use crate::ids::generate_canvas_id;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Canvas {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub elements: Vec<serde_json::Value>,
    pub app_state: serde_json::Value,
}

#[tauri::command]
pub fn list_canvases(state: tauri::State<'_, DbState>) -> Result<Vec<Canvas>, String> {
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
pub fn create_canvas(state: tauri::State<'_, DbState>, title: String) -> Result<Canvas, String> {
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
pub fn delete_canvas(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM canvases WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_canvas(state: tauri::State<'_, DbState>, id: String) -> Result<Option<Canvas>, String> {
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
pub fn save_canvas(
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
pub fn update_canvas_title(
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
