import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForAppUpdates() {
	try {
		const update = await check();

		if (update?.available) {
			const yes = await ask(
				`
Update to ${update.version} is available!
Release notes: ${update.body}
        `,
				{
					title: "Update Now!",
					kind: "info",
					okLabel: "Update",
					cancelLabel: "Cancel",
				},
			);

			if (yes) {
				await update.downloadAndInstall();
				await relaunch();
			}
		}
	} catch (error) {
		// Update checks must never break app startup — the endpoint may be
		// unreachable, the signature invalid, or the platform unsupported.
		console.error("Failed to check for app updates:", error);
	}
}
