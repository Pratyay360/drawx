import { invoke } from "@tauri-apps/api/core";

export async function getDbPath(): Promise<string> {
  try {
    return await invoke<string>("get_db_path");
  } catch (error) {
    console.error("Failed to get database path:", error);
    return "App data directory (drawx.db)";
  }
}
