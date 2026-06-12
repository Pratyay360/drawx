use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Project {
    id: i64,
    name: String,
    created_at: String,
    updated_at: String,
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

#[derive(Debug, Serialize, Deserialize)]
struct AppData {
    projects: Vec<Project>,
    canvases: Vec<Canvas>,
    next_project_id: i64,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
            canvases: Vec::new(),
            next_project_id: 1,
        }
    }
}

fn data_path(app: &tauri::AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
    app_dir.join("drawx_data.json")
}

fn load_data(app: &tauri::AppHandle) -> AppData {
    let path = data_path(app);
    if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        AppData::default()
    }
}

fn save_data(app: &tauri::AppHandle, data: &AppData) {
    let path = data_path(app);
    if let Ok(content) = serde_json::to_string_pretty(data) {
        let _ = std::fs::write(&path, content);
    }
}

/// Generate an RFC 3339 / ISO 8601 timestamp string without external dependencies.
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

/// Convert days since 1970-01-01 to (year, month, day).
/// Uses Howard Hinnant's algorithm.
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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Vec<Project> {
    load_data(&app).projects
}

#[tauri::command]
fn save_project(app: tauri::AppHandle, name: String) {
    let mut data = load_data(&app);
    let now = now_iso();
    data.projects.push(Project {
        id: data.next_project_id,
        name,
        created_at: now.clone(),
        updated_at: now,
    });
    data.next_project_id += 1;
    save_data(&app, &data);
}

#[tauri::command]
fn open_project(_app: tauri::AppHandle, _id: i64) {}

#[tauri::command]
fn list_canvases(app: tauri::AppHandle) -> Vec<Canvas> {
    load_data(&app).canvases
}

#[tauri::command]
fn create_canvas(app: tauri::AppHandle, title: String) -> Canvas {
    let mut data = load_data(&app);
    let now = now_iso();
    let new_canvas = Canvas {
        id: generate_canvas_id(),
        title,
        description: None,
        created_at: now.clone(),
        updated_at: now,
        elements: Vec::new(),
        app_state: serde_json::json!({}),
    };
    data.canvases.push(new_canvas.clone());
    save_data(&app, &data);
    new_canvas
}


#[tauri::command]
fn delete_canvas(app: tauri::AppHandle, id: String) {
    let mut data = load_data(&app);
    data.canvases.retain(|c| c.id != id);
    save_data(&app, &data);
}

#[tauri::command]
fn load_canvas(app: tauri::AppHandle, id: String) -> Option<Canvas> {
    load_data(&app).canvases.into_iter().find(|c| c.id == id)
}

#[tauri::command]
fn save_canvas(
    app: tauri::AppHandle,
    id: String,
    elements: Vec<serde_json::Value>,
    app_state: serde_json::Value,
) {
    let mut data = load_data(&app);
    if let Some(canvas) = data.canvases.iter_mut().find(|c| c.id == id) {
        canvas.elements = elements;
        canvas.app_state = app_state;
        canvas.updated_at = now_iso();
    }
    save_data(&app, &data);
}

#[tauri::command]
fn update_canvas_title(app: tauri::AppHandle, id: String, title: String) {
    let mut data = load_data(&app);
    if let Some(canvas) = data.canvases.iter_mut().find(|c| c.id == id) {
        canvas.title = title;
        canvas.updated_at = now_iso();
    }
    save_data(&app, &data);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_projects,
            save_project,
            open_project,
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
