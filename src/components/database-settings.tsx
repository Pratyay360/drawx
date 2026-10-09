import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { FilePlus, FolderOpen, Loader2, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	createNewDbPath,
	type DbInfo,
	getDbInfo,
	selectExistingDbPath,
	setDbConfig,
} from "../services/db.ts";
import { isTauri } from "../services/tauri.ts";

interface DatabaseSettingsProps {
	onClose: () => void;
}

export function DatabaseSettings({ onClose }: DatabaseSettingsProps) {
	const [dbInfo, setDbInfo] = useState<DbInfo>({
		local_path: null,
		current_path: "",
		is_default: true,
	});
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [isChanged, setIsChanged] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadInfo = useCallback(async () => {
		try {
			const info = await getDbInfo();
			setDbInfo(info);
			setSelectedPath(info.local_path);
			setIsChanged(false);
		} catch {
			setError("Failed to load database configuration");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadInfo();
	}, [loadInfo]);

	async function handleSelectExisting() {
		try {
			const path = await selectExistingDbPath();
			if (path) {
				setSelectedPath(path);
				setIsChanged(true);
			}
		} catch {
			setError("Failed to select database location");
		}
	}

	async function handleCreateNew() {
		try {
			const path = await createNewDbPath();
			if (path) {
				setSelectedPath(path);
				setIsChanged(true);
			}
		} catch {
			setError("Failed to create database location");
		}
	}

	async function handleResetDefault() {
		if (isTauri()) {
			const confirmed = await ask(
				"Are you sure you want to reset the database to the default location?",
				{ title: "Reset Database Location", kind: "warning" },
			);
			if (!confirmed) return;
		}
		setSelectedPath(null);
		setIsChanged(true);
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		try {
			const updatedInfo = await setDbConfig({ local_path: selectedPath });
			setDbInfo(updatedInfo);
			setIsChanged(false);

			if (isTauri()) {
				const shouldRestart = await ask(
					"Database location has been updated. Would you like to restart Drawx now to apply changes?",
					{ title: "Restart Required", kind: "info" },
				);
				if (shouldRestart) {
					await relaunch();
				}
			}
			onClose();
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			setError(`Failed to save database configuration: ${detail}`);
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
					subtitle="Configure local drawing storage location"
					onOpenChange={onClose}
				/>
			}
			content={
				<LayoutContent padding={4}>
					<VStack gap={4}>
						{error && <Banner status="error" title={error} />}

						<VStack gap={2}>
							<HStack justify="between" align="center">
								<Text type="label" weight="medium">
									Current Location
								</Text>
								<Badge
									label={dbInfo.is_default ? "Default" : "Custom"}
									variant={dbInfo.is_default ? "neutral" : "info"}
								/>
							</HStack>

							<Text type="code" maxLines={2}>
								{selectedPath ?? dbInfo.current_path ?? "Default storage"}
							</Text>

							<Text type="supporting">
								{dbInfo.is_default && !selectedPath
									? "Using default app data directory"
									: "Custom SQLite database location"}
							</Text>
						</VStack>

						<VStack gap={2}>
							<Text type="label" weight="medium">
								Actions
							</Text>
							<HStack gap={2} wrap="wrap">
								<Button
									label="Open Existing..."
									variant="secondary"
									size="sm"
									icon={<Icon icon={FolderOpen} size="sm" />}
									onClick={handleSelectExisting}
									isDisabled={!isTauri()}
								/>
								<Button
									label="Create New..."
									variant="secondary"
									size="sm"
									icon={<Icon icon={FilePlus} size="sm" />}
									onClick={handleCreateNew}
									isDisabled={!isTauri()}
								/>
								{(selectedPath !== null || !dbInfo.is_default) && (
									<Button
										label="Reset to Default"
										variant="ghost"
										size="sm"
										icon={<Icon icon={RotateCcw} size="sm" />}
										onClick={handleResetDefault}
										isDisabled={!isTauri()}
									/>
								)}
							</HStack>
						</VStack>

						{isChanged && (
							<Banner
								status="warning"
								title="App restart recommended"
								description="You will be prompted to restart Drawx upon saving your changes."
							/>
						)}
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
							isDisabled={!isChanged}
						/>
					</HStack>
				</LayoutFooter>
			}
		/>
	);
}
