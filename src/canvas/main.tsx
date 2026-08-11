// deno-lint-ignore-file
import {
	DefaultSidebar,
	Excalidraw,
	Sidebar as ExcalidrawSidebar,
	exportToBlob,
	exportToSvg,
	MainMenu,
	WelcomeScreen,
} from "@excalidraw/excalidraw";
import type {
	ExcalidrawElement,
	OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	BinaryFiles,
	ExcalidrawImperativeAPI,
	LibraryItem,
	LibraryItems,
} from "@excalidraw/excalidraw/types";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LibraryPanelTab } from "../components/library-panel-tab.tsx";
import { Sidebar } from "../components/sidebar.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../components/ui/tooltip.tsx";
import {
	getUserLibrary,
	onLibraryItemsInstalled,
	setUserLibrary,
} from "../services/libraries.ts";
import {
	type Canvas as CanvasData,
	loadCanvas,
	sanitizeExcalidrawAppState,
	saveCanvas,
	updateCanvasTitle,
} from "../services/tauri.ts";

type ElementSignature = { id: string; version: number };

function areElementsEqual(
	a: ElementSignature[],
	b: ElementSignature[],
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].id !== b[i].id || a[i].version !== b[i].version) {
			return false;
		}
	}
	return true;
}

function areAppStatesEqual(
	a: Partial<AppState>,
	b: Partial<AppState>,
): boolean {
	return (
		a.gridSize === b.gridSize &&
		a.zenModeEnabled === b.zenModeEnabled &&
		a.gridModeEnabled === b.gridModeEnabled &&
		a.viewModeEnabled === b.viewModeEnabled
	);
}

function getPersistentAppState(appState: Partial<AppState>): Partial<AppState> {
	if (!appState || typeof appState !== "object") return {};
	return {
		viewBackgroundColor: appState.viewBackgroundColor,
		gridSize: appState.gridSize,
		zenModeEnabled: appState.zenModeEnabled,
		gridModeEnabled: appState.gridModeEnabled,
		viewModeEnabled: appState.viewModeEnabled,
	};
}

export function Canvas() {
	const { id } = useParams<{ id: string }>();
	const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
	const [loading, setLoading] = useState(true);
	const [isChangingCanvas, setIsChangingCanvas] = useState(false);
	const [elements, setElements] = useState<ExcalidrawElement[]>([]);
	const [appState, setAppState] = useState<Partial<AppState>>({});
	const [excalidrawAPI, setExcalidrawAPI] =
		useState<ExcalidrawImperativeAPI | null>(null);

	// Library items are loaded from disk (never from the network) when the
	// canvas mounts, so saved libraries are available instantly and offline.
	const initialLibraryItemsRef = useRef<Promise<LibraryItems> | null>(null);
	if (!initialLibraryItemsRef.current) {
		initialLibraryItemsRef.current = getUserLibrary();
	}

	const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">(
		"saved",
	);

	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [titleInput, setTitleInput] = useState("");

	const lastSavedData = useRef<{
		elements: ElementSignature[];
		appState: Partial<AppState>;
	}>({
		elements: [],
		appState: {},
	});

	const isSavingRef = useRef(false);
	const librarySaveTimerRef = useRef<number | null>(null);
	const pendingLibraryRef = useRef<LibraryItem[] | null>(null);

	// Persist the full editor library (downloaded + hand-added items) whenever
	// it changes, so nothing is lost between sessions or across canvases.
	const handleLibraryChange = useCallback((items: readonly LibraryItem[]) => {
		pendingLibraryRef.current = [...items];
		if (librarySaveTimerRef.current !== null) {
			globalThis.clearTimeout(librarySaveTimerRef.current);
		}
		librarySaveTimerRef.current = globalThis.setTimeout(() => {
			const toSave = pendingLibraryRef.current;
			pendingLibraryRef.current = null;
			if (toSave) setUserLibrary(toSave);
		}, 300);
	}, []);

	// Flush any pending library save when the canvas unmounts, so the user's
	// last in-editor library edits are never lost.
	useEffect(() => {
		return () => {
			if (librarySaveTimerRef.current !== null) {
				window.clearTimeout(librarySaveTimerRef.current);
				librarySaveTimerRef.current = null;
			}
			const toSave = pendingLibraryRef.current;
			pendingLibraryRef.current = null;
			if (toSave) setUserLibrary(toSave);
		};
	}, []);

	// Libraries installed/refreshed from the library browser are merged into
	// the editor library (never replacing what's already there).
	useEffect(() => {
		if (!excalidrawAPI) return;
		return onLibraryItemsInstalled((items) => {
			excalidrawAPI.updateLibrary({ libraryItems: items, merge: true });
		});
	}, [excalidrawAPI]);

	const fetchCanvas = useCallback(
		async (canvasId: string, isInitialMount: boolean) => {
			if (isInitialMount) {
				setLoading(true);
			} else {
				setIsChangingCanvas(true);
			}

			try {
				const data = await loadCanvas(canvasId);
				if (data) {
					const sanitizedAppState = sanitizeExcalidrawAppState(data.appState);
					const resolvedElements = data.elements || [];

					setCanvasData({ ...data, appState: sanitizedAppState });
					setElements(resolvedElements);
					setAppState(sanitizedAppState);
					setTitleInput(data.title);

					lastSavedData.current = {
						elements: resolvedElements.map((e) => ({
							id: e.id,
							version: e.version,
						})),
						appState: getPersistentAppState(sanitizedAppState),
					};

					if (excalidrawAPI) {
						excalidrawAPI.updateScene({
							elements: resolvedElements,
							appState: {
								...sanitizedAppState,
							} as AppState,
						});
					}
				}
			} catch (error) {
				console.error("Failed to load canvas:", error);
			} finally {
				if (isInitialMount) {
					setLoading(false);
				} else {
					setIsChangingCanvas(false);
				}
			}
		},
		[excalidrawAPI],
	);

	useEffect(() => {
		if (!id) return;
		setSaveStatus("saved");
		const isInitialMount = !excalidrawAPI;
		fetchCanvas(id, isInitialMount);
	}, [id, excalidrawAPI, fetchCanvas]);

	useEffect(() => {
		if (loading || isChangingCanvas || !id || saveStatus !== "unsaved") return;

		const timer = setTimeout(async () => {
			setSaveStatus("saving");
			isSavingRef.current = true;
			try {
				await saveCanvas(id, elements, appState);
				setSaveStatus("saved");
			} catch (error) {
				console.error("Failed to auto-save canvas:", error);
				setSaveStatus("unsaved");
			} finally {
				isSavingRef.current = false;
			}
		}, 1500);

		return () => clearTimeout(timer);
	}, [elements, appState, id, loading, isChangingCanvas, saveStatus]);

	const handleManualSave = useCallback(async () => {
		if (!id || isSavingRef.current || saveStatus !== "unsaved") return;

		setSaveStatus("saving");
		isSavingRef.current = true;
		try {
			await saveCanvas(id, elements, appState);
			setSaveStatus("saved");
		} catch (error) {
			console.error("Failed to save canvas:", error);
			setSaveStatus("unsaved");
		} finally {
			isSavingRef.current = false;
		}
	}, [id, elements, appState, saveStatus]);

	const handleExcalidrawChange = useCallback(
		(
			excalidrawElements: readonly OrderedExcalidrawElement[],
			excalidrawAppState: AppState,
			_files: BinaryFiles,
		) => {
			if (loading || isChangingCanvas) return;

			const currentElementsSig = excalidrawElements.map((e) => ({
				id: e.id,
				version: e.version,
			}));
			const currentPersistentState = getPersistentAppState(excalidrawAppState);

			const savedElementsSig = lastSavedData.current?.elements || [];
			const savedPersistentState = lastSavedData.current?.appState || {};

			const elementsChanged = !areElementsEqual(
				currentElementsSig,
				savedElementsSig,
			);
			const appStateChanged = !areAppStatesEqual(
				currentPersistentState,
				savedPersistentState,
			);

			if (elementsChanged || appStateChanged) {
				setElements([...excalidrawElements]);
				setAppState(currentPersistentState);
				setSaveStatus("unsaved");

				lastSavedData.current = {
					elements: currentElementsSig,
					appState: currentPersistentState,
				};
			}
		},
		[loading, isChangingCanvas],
	);

	async function handleTitleSave() {
		if (!id || !titleInput.trim()) return;
		try {
			await updateCanvasTitle(id, titleInput.trim());
			if (canvasData) {
				setCanvasData({ ...canvasData, title: titleInput.trim() });
			}
			setIsEditingTitle(false);
			globalThis.dispatchEvent(new Event("canvas-updated"));
		} catch (error) {
			console.error("Failed to update title:", error);
		}
	}

	function handleTitleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			handleTitleSave();
		} else if (e.key === "Escape") {
			setTitleInput(canvasData?.title || "");
			setIsEditingTitle(false);
		}
	}

	useEffect(() => {
		if (!excalidrawAPI) return;

		excalidrawAPI.updateScene({
			elements: elements,
			appState: appState as AppState,
		});
	}, [excalidrawAPI, elements, appState]);

	const handleExportToJSON = useCallback(() => {
		if (!canvasData) return;
		const exportData = {
			type: "excalidraw",
			version: 2,
			elements: elements,
			appState: appState,
		};
		const jsonString = JSON.stringify(exportData, null, 2);
		const blob = new Blob([jsonString], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${canvasData.title || "untitled"}.excalidraw`;
		link.click();
		URL.revokeObjectURL(url);
	}, [canvasData, elements, appState]);

	const handleImportFromJSON = useCallback(() => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,.excalidraw";
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = (event) => {
				try {
					const imported = JSON.parse(event.target?.result as string);
					if (imported && Array.isArray(imported.elements)) {
						if (excalidrawAPI) {
							const importedAppState = getPersistentAppState(
								imported.appState || {},
							);
							excalidrawAPI.updateScene({
								elements: imported.elements,
								appState: {
									...importedAppState,
								} as AppState,
							});

							setElements(imported.elements);
							setAppState(importedAppState);
							setSaveStatus("unsaved");
						}
					} else {
						alert("Invalid Excalidraw file structure.");
					}
				} catch (err) {
					console.error("Failed to parse imported file:", err);
					alert("Failed to parse the imported file.");
				}
			};
			reader.readAsText(file);
		};
		input.click();
	}, [excalidrawAPI]);

	const handleExportToPNG = useCallback(async () => {
		if (!excalidrawAPI || !canvasData) return;
		try {
			const currentElements = excalidrawAPI.getSceneElements();
			const currentAppState = excalidrawAPI.getAppState();
			const blob = await exportToBlob({
				elements: currentElements,
				appState: currentAppState,
				mimeType: "image/png",
				exportPadding: 15,
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${canvasData.title || "drawing"}.png`;
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Failed to export PNG:", error);
		}
	}, [excalidrawAPI, canvasData]);

	const handleExportToSVG = useCallback(async () => {
		if (!excalidrawAPI || !canvasData) return;
		try {
			const currentElements = excalidrawAPI.getSceneElements();
			const currentAppState = excalidrawAPI.getAppState();
			const svg = await exportToSvg({
				elements: currentElements,
				appState: currentAppState,
				exportPadding: 15,
			});
			const svgString = new XMLSerializer().serializeToString(svg);
			const blob = new Blob([svgString], { type: "image/svg+xml" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${canvasData.title || "drawing"}.svg`;
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Failed to export SVG:", error);
		}
	}, [excalidrawAPI, canvasData]);

	if (loading) {
		return (
			<div className="flex h-screen font-sans bg-background text-foreground">
				<Sidebar />
				<main className="flex-1 flex items-center justify-center bg-card">
					<div className="flex flex-col items-center gap-3">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						<span className="text-xs text-muted-foreground">Loading...</span>
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="flex h-screen font-sans overflow-hidden bg-background text-foreground">
			<Sidebar />
			<main className="flex-1 flex flex-col h-full overflow-hidden relative">
				<div className="flex items-center justify-between px-3 py-1.5 z-20 shrink-0 border-b bg-card">
					<div className="flex items-center gap-2 max-w-[60%]">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Link
										to="/"
										className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
									>
										<Icon icon="lucide:arrow-left" className="w-4 h-4" />
									</Link>
								</TooltipTrigger>
								<TooltipContent>Back to workspace</TooltipContent>
							</Tooltip>
						</TooltipProvider>

						<div className="w-px h-4 shrink-0 bg-border" />

						{isEditingTitle ? (
							<Input
								type="text"
								value={titleInput}
								onChange={(e) => setTitleInput(e.currentTarget.value)}
								onKeyDown={handleTitleKeyDown}
								onBlur={handleTitleSave}
								className="h-7 text-sm font-medium px-1.5 max-w-62.5"
								autoFocus
							/>
						) : (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setIsEditingTitle(true)}
								className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-sm font-medium truncate group h-auto"
								title="Click to rename"
							>
								<span className="truncate">
									{canvasData?.title || "Untitled"}
								</span>
								<Icon
									icon="lucide:pencil"
									className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground"
								/>
							</Button>
						)}
					</div>

					<div className="flex items-center gap-1.5 shrink-0">
						<span className="text-xs mr-1 hidden sm:inline text-muted-foreground">
							{saveStatus === "saving" && "Saving..."}
							{saveStatus === "saved" && "Saved"}
							{saveStatus === "unsaved" && "Unsaved"}
						</span>

						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={handleManualSave}
										disabled={saveStatus === "saving" || saveStatus === "saved"}
									>
										{saveStatus === "saving" ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Icon icon="lucide:save" className="h-4 w-4" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>Save</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>

				{/* Excalidraw Board */}
				<div className="flex-1 w-full h-full min-h-0 relative z-10">
					<Excalidraw
						excalidrawAPI={(api) => setExcalidrawAPI(api)}
						theme="dark"
						initialData={{
							elements: elements,
							appState: appState,
							libraryItems: initialLibraryItemsRef.current,
						}}
						onChange={handleExcalidrawChange}
						onLibraryChange={handleLibraryChange}
					>
						<MainMenu>
							<MainMenu.DefaultItems.ClearCanvas />
							<MainMenu.Separator />
							<MainMenu.Item
								onSelect={handleExportToJSON}
								icon={<Icon icon="lucide:download" className="w-4 h-4" />}
							>
								Export File (.excalidraw)
							</MainMenu.Item>
							<MainMenu.Item
								onSelect={handleImportFromJSON}
								icon={<Icon icon="lucide:upload" className="w-4 h-4" />}
							>
								Import File (.excalidraw)
							</MainMenu.Item>
							<MainMenu.Separator />
							<MainMenu.Item
								onSelect={handleExportToPNG}
								icon={<Icon icon="lucide:image" className="w-4 h-4" />}
							>
								Export as PNG
							</MainMenu.Item>
							<MainMenu.Item
								onSelect={handleExportToSVG}
								icon={<Icon icon="lucide:file-code" className="w-4 h-4" />}
							>
								Export as SVG
							</MainMenu.Item>
							<MainMenu.Separator />
							<MainMenu.DefaultItems.Help />
						</MainMenu>
						<WelcomeScreen>
							<WelcomeScreen.Center>
								<WelcomeScreen.Center.Logo>
									<Icon
										icon="lucide:pen-tool"
										className="w-8 h-8 text-primary mx-auto mb-1"
									/>
								</WelcomeScreen.Center.Logo>
								<WelcomeScreen.Center.Heading>
									Drawx
								</WelcomeScreen.Center.Heading>
								<WelcomeScreen.Center.MenuItemHelp />
								<div className="text-xs max-w-xs mx-auto mt-2 text-muted-foreground">
									Sketch, add shapes, or use templates. Changes save
									automatically.
								</div>
							</WelcomeScreen.Center>
						</WelcomeScreen>

						{/* Custom tab next to the Library tab: browse saved libraries
						    without leaving the canvas. */}
						<DefaultSidebar>
							<DefaultSidebar.TabTriggers>
								<ExcalidrawSidebar.TabTrigger
									tab="drawx-libraries"
									title="Drawx libraries"
									aria-label="Drawx libraries"
								>
									<Icon icon="lucide:shapes" className="w-4 h-4" />
								</ExcalidrawSidebar.TabTrigger>
							</DefaultSidebar.TabTriggers>
							<ExcalidrawSidebar.Tab tab="drawx-libraries">
								<LibraryPanelTab />
							</ExcalidrawSidebar.Tab>
						</DefaultSidebar>
					</Excalidraw>

					{isChangingCanvas && (
						<div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
