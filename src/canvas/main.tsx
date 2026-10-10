import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
	DefaultSidebar,
	Excalidraw,
	Sidebar as ExcalidrawSidebar,
	MainMenu,
	WelcomeScreen,
} from "@excalidraw/excalidraw";
import {
	ArrowLeft,
	Download,
	FileCode,
	Image,
	Library,
	Loader2,
	PenTool,
	Upload,
} from "lucide-react";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LibraryPanelTab } from "../components/library-panel-tab.tsx";
import { Sidebar } from "../components/sidebar.tsx";
import { useTheme } from "../hooks/use-theme.ts";
import { updateCanvasTitle } from "../services/tauri.ts";
import { useCanvasStore } from "../stores/canvas.ts";
import { CanvasHeader } from "./components/CanvasHeader.tsx";
import { useCanvasData } from "./hooks/useCanvasData.ts";
import { useCanvasExports } from "./hooks/useCanvasExports.ts";
import { useLibraryPersistence } from "./hooks/useLibraryPersistence.ts";

export function Canvas() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { mode } = useTheme();

	const {
		canvasData,
		elements,
		appState,
		loading,
		loadError,
		isChangingCanvas,
		saveStatus,
		titleInput,
		isEditingTitle,
		excalidrawAPI,
		setTitleInput,
		setIsEditingTitle,
		setExcalidrawAPI,
		fetchCanvas,
		handleExcalidrawChange,
		save,
	} = useCanvasData(id);

	const { handleLibraryChange, initialLibraryItems } = useLibraryPersistence();

	const {
		handleExportToJSON,
		handleImportFromJSON,
		handleExportToPNG,
		handleExportToSVG,
	} = useCanvasExports();

	const handleTitleSave = useCallback(async () => {
		if (!id || !titleInput.trim()) return;
		try {
			await updateCanvasTitle(id, titleInput.trim());
			const current = useCanvasStore.getState().canvasData;
			if (current) {
				useCanvasStore.setState({
					canvasData: { ...current, title: titleInput.trim() },
				});
			}
			setIsEditingTitle(false);
			globalThis.dispatchEvent(new Event("canvas-updated"));
		} catch (error) {
			console.error("Failed to update title:", error);
		}
	}, [id, titleInput, setIsEditingTitle]);

	const handleTitleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				void handleTitleSave();
			} else if (e.key === "Escape") {
				setTitleInput(canvasData?.title || "");
				setIsEditingTitle(false);
			}
		},
		[handleTitleSave, canvasData, setTitleInput, setIsEditingTitle],
	);

	if (loading) {
		return (
			<AppShell contentPadding={0} sideNav={<Sidebar />}>
				<Center height="100%">
					<VStack gap={2} hAlign="center">
						<Icon icon={Loader2} size="lg" />
						<Text type="supporting">Loading canvas…</Text>
						<Text type="supporting">Slow network — hang tight</Text>
					</VStack>
				</Center>
			</AppShell>
		);
	}

	if (loadError) {
		return (
			<AppShell contentPadding={0} sideNav={<Sidebar />}>
				<Center height="100%">
					<VStack gap={3} hAlign="center" maxWidth={400}>
						<Text weight="medium">Failed to load canvas</Text>
						<Text type="supporting" justify="center">
							{loadError}
						</Text>
						<HStack gap={2}>
							<Button
								label="Retry"
								icon={<Icon icon={Loader2} size="sm" />}
								onClick={() => id && void fetchCanvas(id, true)}
							/>
							<Button
								label="Back to workspace"
								variant="ghost"
								icon={<Icon icon={ArrowLeft} size="sm" />}
								onClick={() => navigate("/")}
							/>
						</HStack>
					</VStack>
				</Center>
			</AppShell>
		);
	}

	return (
		<AppShell contentPadding={0} sideNav={<Sidebar />}>
			<Layout
				height="fill"
				header={
					<CanvasHeader
						title={canvasData?.title || "Untitled"}
						titleInput={titleInput}
						isEditingTitle={isEditingTitle}
						saveStatus={saveStatus}
						onTitleInputChange={setTitleInput}
						onTitleKeyDown={handleTitleKeyDown}
						onStartEditTitle={() => setIsEditingTitle(true)}
						onManualSave={() => id && void save(id)}
					/>
				}
				content={
					<LayoutContent isScrollable={false} padding={0}>
						<div className="relative h-full w-full min-h-0 overflow-hidden">
							<Excalidraw
								excalidrawAPI={(api) => setExcalidrawAPI(api)}
								theme={mode}
								initialData={{
									elements,
									appState,
									libraryItems: initialLibraryItems,
								}}
								onChange={handleExcalidrawChange}
								onLibraryChange={handleLibraryChange}
							>
								<MainMenu>
									<MainMenu.DefaultItems.ClearCanvas />
									<MainMenu.Separator />
									<MainMenu.Item
										onSelect={handleExportToJSON}
										icon={<Icon icon={Download} size="sm" />}
									>
										Export File (.excalidraw)
									</MainMenu.Item>
									<MainMenu.Item
										onSelect={handleImportFromJSON}
										icon={<Icon icon={Upload} size="sm" />}
									>
										Import File (.excalidraw)
									</MainMenu.Item>
									<MainMenu.Separator />
									<MainMenu.Item
										onSelect={handleExportToPNG}
										icon={<Icon icon={Image} size="sm" />}
									>
										Export as PNG
									</MainMenu.Item>
									<MainMenu.Item
										onSelect={handleExportToSVG}
										icon={<Icon icon={FileCode} size="sm" />}
									>
										Export as SVG
									</MainMenu.Item>
									<MainMenu.Separator />
									<MainMenu.DefaultItems.Help />
								</MainMenu>
								<WelcomeScreen>
									<WelcomeScreen.Center>
										<WelcomeScreen.Center.Logo>
											<Icon icon={PenTool} size="lg" />
										</WelcomeScreen.Center.Logo>
										<WelcomeScreen.Center.Heading>
											Drawx
										</WelcomeScreen.Center.Heading>
										<WelcomeScreen.Center.MenuItemHelp />
										<Text type="supporting" justify="center">
											Sketch, add icons, or use templates. Changes save
											automatically.
										</Text>
									</WelcomeScreen.Center>
								</WelcomeScreen>

								<DefaultSidebar>
									<DefaultSidebar.TabTriggers>
										<ExcalidrawSidebar.TabTrigger
											tab="drawx-libraries"
											title="Drawx libraries"
											aria-label="Drawx libraries"
										>
											<Icon icon={Library} size="sm" />
										</ExcalidrawSidebar.TabTrigger>
									</DefaultSidebar.TabTriggers>
									<ExcalidrawSidebar.Tab tab="drawx-libraries">
										<LibraryPanelTab />
									</ExcalidrawSidebar.Tab>
								</DefaultSidebar>
							</Excalidraw>

							{isChangingCanvas && (
								<Center height="100%">
									<Icon icon={Loader2} size="lg" />
								</Center>
							)}
						</div>
					</LayoutContent>
				}
			/>
		</AppShell>
	);
}
