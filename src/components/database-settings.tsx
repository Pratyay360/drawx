import { useState, useEffect } from "react";
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
		db_type: "local",
		local_path: null,
		remote_url: null,
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadConfig();
	}, []);

	async function loadConfig() {
		try {
			const loadedConfig = await getDbConfig();
			setConfig(loadedConfig);
		} catch {
			setError("Failed to load database configuration");
		} finally {
			setLoading(false);
		}
	}

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
				<CardDescription>Choose where to store your drawings</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
						{error}
					</div>
				)}

				<div className="space-y-2">
					<label className="text-sm font-medium">Database Type</label>
					<div className="flex gap-2">
						<Button
							variant={config.db_type === "local" ? "default" : "outline"}
							onClick={() =>
								setConfig((prev) => ({ ...prev, db_type: "local" }))
							}
							className="flex-1"
						>
							<Icon icon="lucide:hard-drive" className="w-4 h-4 mr-2" />
							Local
						</Button>
						<Button
							variant={config.db_type === "remote" ? "default" : "outline"}
							onClick={() =>
								setConfig((prev) => ({ ...prev, db_type: "remote" }))
							}
							className="flex-1"
						>
							<Icon icon="lucide:cloud" className="w-4 h-4 mr-2" />
							Remote
						</Button>
					</div>
				</div>

				{config.db_type === "local" && (
					<div className="space-y-2">
						<label className="text-sm font-medium">Database Location</label>
						<div className="flex gap-2">
							<Input
								type="text"
								value={config.local_path || "Default location"}
								readOnly
								className="flex-1"
							/>
							<Button variant="outline" onClick={handleSelectPath}>
								<Icon icon="lucide:folder-open" className="w-4 h-4" />
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							{config.local_path
								? "Custom database location"
								: "Using default app data directory"}
						</p>
					</div>
				)}

				{config.db_type === "remote" && (
					<div className="space-y-2">
						<label className="text-sm font-medium">Remote URL</label>
						<Input
							type="url"
							value={config.remote_url || ""}
							onChange={(e) =>
								setConfig((prev) => ({ ...prev, remote_url: e.target.value }))
							}
							placeholder="https://api.example.com/database"
						/>
						<p className="text-xs text-muted-foreground">
							Enter the URL of your remote database endpoint
						</p>
					</div>
				)}

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
