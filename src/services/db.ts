import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";

export interface DbConfig {
	local_path: string;
}

export async function getDbConfig(): Promise<DbConfig> {
	if (!isTauri()) {
		return { local_path: "" };
	}
	try {
		return await invoke<DbConfig>("get_db_config");
	} catch (error) {
		console.error("Failed to get database config:", error);
		return {
			local_path: "",
		};
	}
}

export async function setDbConfig(config: DbConfig): Promise<void> {
	if (!isTauri()) {
		return;
	}
	try {
		await invoke("set_db_config", { config });
	} catch (error) {
		console.error("Failed to set database config:", error);
		throw error;
	}
}

export async function selectLocalDbPath(): Promise<string> {
	if (!isTauri()) {
		return "";
	}
	try {
		return await invoke<string>("select_local_db_path");
	} catch (error) {
		console.error("Failed to select local database path:", error);
		return "";
	}
}
