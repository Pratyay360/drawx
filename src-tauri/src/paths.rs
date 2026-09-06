use tauri::Manager;

pub fn home_dir() -> Option<std::path::PathBuf> {
    std::env::var("HOME")
        .ok()
        .filter(|home| !home.trim().is_empty())
        .map(std::path::PathBuf::from)
}

pub fn config_dir_base() -> std::path::PathBuf {
    match std::env::var("XDG_CONFIG_HOME") {
        Ok(dir) if !dir.trim().is_empty() => std::path::PathBuf::from(dir),
        _ => match home_dir() {
            Some(home) => home.join(".config"),
            None => std::env::temp_dir(),
        },
    }
}

pub fn resolve_config_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    match app.path().app_config_dir() {
        Ok(dir) => dir,
        Err(_) => config_dir_base().join(&app.config().identifier),
    }
}

pub fn prepare_data_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
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
