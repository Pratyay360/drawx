use crate::db::DbState;
use crate::time::now_iso;

#[tauri::command]
pub fn get_user_library(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
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
pub fn set_user_library(
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
