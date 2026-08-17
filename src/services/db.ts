import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "./tauri";

export interface DbConfig {
	local_path: string | null;
}

export interface DbInfo {
	local_path: string | null;
	current_path: string;
	is_default: boolean;
}

export async function getDbInfo(): Promise<DbInfo> {
	if (!isTauri()) {
		return {
			local_path: null,
			current_path: "Browser Storage (Local Storage)",
			is_default: true,
		};
	}
	try {
		return await invoke<DbInfo>("get_db_info");
	} catch (error) {
		console.error("Failed to get database info:", error);
		return {
			local_path: null,
			current_path: "Default location",
			is_default: true,
		};
	}
}

export async function getDbConfig(): Promise<DbConfig> {
	if (!isTauri()) {
		return { local_path: null };
	}
	try {
		return await invoke<DbConfig>("get_db_config");
	} catch (error) {
		console.error("Failed to get database config:", error);
		return {
			local_path: null,
		};
	}
}

export async function setDbConfig(config: DbConfig): Promise<DbInfo> {
	if (!isTauri()) {
		return {
			local_path: config.local_path,
			current_path: "Browser Storage (Local Storage)",
			is_default: !config.local_path,
		};
	}
	try {
		return await invoke<DbInfo>("set_db_config", { config });
	} catch (error) {
		console.error("Failed to set database config:", error);
		throw error;
	}
}

export async function selectExistingDbPath(): Promise<string> {
	if (!isTauri()) {
		return "";
	}
	try {
		const path = await open({
			title: "Choose Existing SQLite Database",
			filters: [
				{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
			],
		});
		if (typeof path === "string") {
			return path;
		}
		return "";
	} catch {
		try {
			const path = await invoke<string | null>("select_local_db_path");
			return path ?? "";
		} catch (innerError) {
			console.error("Failed to select existing database path:", innerError);
			return "";
		}
	}
}

export async function createNewDbPath(): Promise<string> {
	if (!isTauri()) {
		return "";
	}
	try {
		const path = await save({
			title: "Create New SQLite Database",
			defaultPath: "drawx.db",
			filters: [
				{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
			],
		});
		return path ?? "";
	} catch (error) {
		try {
			const path = await invoke<string | null>("create_new_db_path");
			return path ?? "";
		} catch {
			console.error("Failed to create new database path:", error);
			return "";
		}
	}
}

export const selectLocalDbPath = selectExistingDbPath;
