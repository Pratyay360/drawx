import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export type UpdateInfo = {
	version: string;
	notes: string | null;
};

const UPDATE_AVAILABLE_EVENT = "update-available";
const SKIPPED_UPDATE_KEY = "drawx-skipped-update";

function parseUpdateEvent(event: Event): UpdateInfo | null {
	if (!(event instanceof CustomEvent)) return null;
	const detail = event.detail;
	if (
		detail === null ||
		Object.prototype.toString.call(detail) !== "[object Object]"
	)
		return null;
	const version = detail.version;

	const notes = detail.notes;
	if (Object.prototype.toString.call(version) !== "[object String]")
		return null;
	if (
		notes !== null &&
		Object.prototype.toString.call(notes) !== "[object String]"
	)
		return null;

	return {
		version: version,
		notes: notes,
	};
}

export function onUpdateAvailable(
	callback: (info: UpdateInfo) => void,
): () => void {
	const handler = (event: Event) => {
		const parsed = parseUpdateEvent(event);
		if (parsed) callback(parsed);
	};
	globalThis.addEventListener(UPDATE_AVAILABLE_EVENT, handler);
	return () => globalThis.removeEventListener(UPDATE_AVAILABLE_EVENT, handler);
}

export async function checkForAppUpdates(): Promise<void> {
	try {
		const update = await check({ timeout: 10_000 });
		if (!update?.available) return;

		const skipped = getSkippedUpdate();
		if (update.version === skipped) return;

		globalThis.dispatchEvent(
			new CustomEvent(UPDATE_AVAILABLE_EVENT, {
				detail: {
					version: update.version,
					notes: update.body ?? null,
				} satisfies UpdateInfo,
			}),
		);
	} catch (error) {
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
