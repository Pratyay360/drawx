import { invoke } from "@tauri-apps/api/core";

export interface DbConfig {
	local_path: string | null;
}

export async function getDbConfig(): Promise<DbConfig> {
	try {
		return await invoke<DbConfig>("get_db_config");
	} catch (error) {
		console.error("Failed to get database config:", error);
		return {
			local_path: null,
		};
	}
}

export async function setDbConfig(config: DbConfig): Promise<void> {
	try {
		await invoke("set_db_config", { config });
	} catch (error) {
		console.error("Failed to set database config:", error);
		throw error;
	}
}

export async function selectLocalDbPath(): Promise<string | null> {
	try {
		return await invoke<string | null>("select_local_db_path");
	} catch (error) {
		console.error("Failed to select local database path:", error);
		return null;
	}
}
