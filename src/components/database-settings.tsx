import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "./ui/card.tsx";
import {
	getDbConfig,
	setDbConfig,
	selectLocalDbPath,
	type DbConfig,
} from "../services/db.ts";

interface DatabaseSettingsProps {
	onClose: () => void;
}

export function DatabaseSettings({ onClose }: DatabaseSettingsProps) {
	const [config, setConfig] = useState<DbConfig>({
		local_path: null,
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadConfig = useCallback(async () => {
		try {
			const loadedConfig = await getDbConfig();
			setConfig(loadedConfig);
		} catch {
			setError("Failed to load database configuration");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadConfig();
	}, [loadConfig]);

	async function handleSelectPath() {
		const path = await selectLocalDbPath();
		if (path) {
			setConfig((prev) => ({ ...prev, local_path: path }));
		}
	}

	async function handleSave() {
		setSaving(true);
		setError(null);

		try {
			await setDbConfig(config);
			onClose();
		} catch {
			setError("Failed to save database configuration");
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin" />
			</div>
		);
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon icon="lucide:database" className="w-5 h-5" />
					Database Settings
				</CardTitle>
				<CardDescription>Store your drawings locally on this device</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
						{error}
					</div>
				)}

				<div className="space-y-2">
					<label htmlFor="database-location" className="text-sm font-medium">
						Database Location
					</label>
					<div className="flex gap-2">
						<Input
							id="database-location"
							type="text"
							value={config.local_path || "Default location"}
							readOnly
							className="flex-1"
						/>
						<Button variant="outline" onClick={handleSelectPath}>
							<Icon icon="lucide:folder-open" className="w-4 h-4 mr-1" />
							Browse…
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						{config.local_path
							? "Custom database location"
							: "Using default app data directory"}
					</p>
					{config.local_path && (
						<p className="text-xs text-amber-600 dark:text-amber-400">
							Restart the app for the new database location to take effect.
						</p>
					)}
				</div>

				<div className="flex justify-end gap-2 pt-4">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? (
							<Icon
								icon="lucide:loader-2"
								className="w-4 h-4 animate-spin mr-2"
							/>
						) : (
							<Icon icon="lucide:save" className="w-4 h-4 mr-2" />
						)}
						Save Changes
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
