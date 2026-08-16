import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { FolderOpen, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	type DbConfig,
	getDbConfig,
	selectLocalDbPath,
	setDbConfig,
} from "../services/db.ts";
import { isTauri } from "../services/tauri.ts";

interface DatabaseSettingsProps {
	onClose: () => void;
}

export function DatabaseSettings({ onClose }: DatabaseSettingsProps) {
	const [config, setConfig] = useState<DbConfig>({
		local_path: "",
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
			<Layout
				header={
					<DialogHeader title="Database Settings" onOpenChange={onClose} />
				}
				content={
					<LayoutContent isScrollable={false}>
						<HStack hAlign="center" padding={8}>
							<Icon icon={Loader2} size="lg" />
						</HStack>
					</LayoutContent>
				}
			/>
		);
	}

	return (
		<Layout
			header={
				<DialogHeader
					title="Database Settings"
					subtitle="Store your drawings locally on this device"
					onOpenChange={onClose}
				/>
			}
			content={
				<LayoutContent padding={4}>
					<VStack gap={3}>
						{error && <Banner status="error" title={error} />}

						<VStack gap={2}>
							<Text type="label" weight="medium">
								Database Location
							</Text>
							<HStack gap={2}>
								<Text type="code" maxLines={1}>
									{config.local_path || "Default location"}
								</Text>
								<Button
									label="Browse…"
									variant="secondary"
									icon={<Icon icon={FolderOpen} size="sm" />}
									onClick={handleSelectPath} isDisabled={!isTauri()}
								/>
							</HStack>
							<Text type="supporting">
								{config.local_path
									? "Custom database location"
									: "Using default app data directory"}
							</Text>
							{config.local_path && (
								<Banner
									status="warning"
									title="Restart required"
									description="Restart the app for the new database location to take effect."
								/>
							)}
						</VStack>
					</VStack>
				</LayoutContent>
			}
			footer={
				<LayoutFooter hasDivider padding={4}>
					<HStack justify="end" gap={2}>
						<Button label="Cancel" variant="secondary" onClick={onClose} />
						<Button
							label="Save Changes"
							variant="primary"
							icon={<Icon icon={Save} size="sm" />}
							onClick={handleSave}
							isLoading={saving}
						/>
					</HStack>
				</LayoutFooter>
			}
		/>
	);
}
