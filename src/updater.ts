import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export interface UpdateInfo {
	version: string;
	notes: string | null;
}

const UPDATE_AVAILABLE_EVENT = "update-available";
const SKIPPED_UPDATE_KEY = "drawx-skipped-update";

export function onUpdateAvailable(
	callback: (info: UpdateInfo) => void,
): () => void {
	const handler = (event: Event) => {
		const detail = (event as CustomEvent).detail;
		if (detail && typeof detail.version === "string") {
			callback({ version: detail.version, notes: detail.notes ?? null });
		}
	};
	globalThis.addEventListener(UPDATE_AVAILABLE_EVENT, handler);
	return () => globalThis.removeEventListener(UPDATE_AVAILABLE_EVENT, handler);
}

/**
 * Check for an update. If one is available (and the user hasn't already
 * dismissed that exact version) it is surfaced as a non-blocking event —
 * never as a native modal — so app startup can't hang on the update prompt.
 */
export async function checkForAppUpdates(): Promise<void> {
	try {
		const update = await check({ timeout: 10_000 });
		if (!update?.available) return;

		const skipped = getSkippedUpdate();
		if (update.version === skipped) return;

		globalThis.dispatchEvent(
			new CustomEvent(UPDATE_AVAILABLE_EVENT, {
				detail: { version: update.version, notes: update.body ?? null },
			}),
		);
	} catch (error) {
		// Update checks must never break app startup — the endpoint may be
		// unreachable, the signature invalid, or the platform unsupported.
		console.error("Failed to check for app updates:", error);
	}
}

/** Download and install a specific update version, then restart the app. */
export async function installUpdate(version: string): Promise<void> {
	try {
		const update = await check({ timeout: 30_000 });
		if (!update?.available || update.version !== version) return;
		await update.downloadAndInstall();
		await relaunch();
	} catch (error) {
		console.error("Failed to install update:", error);
		throw error;
	}
}

/** Remember that the user dismissed this version so we don't nag again. */
export function skipUpdate(version: string): void {
	try {
		localStorage.setItem(SKIPPED_UPDATE_KEY, version);
	} catch {
		// Ignore storage errors (e.g. private browsing).
	}
}

function getSkippedUpdate(): string | null {
	try {
		return localStorage.getItem(SKIPPED_UPDATE_KEY);
	} catch {
		return null;
	}
}
