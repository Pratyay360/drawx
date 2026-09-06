import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback } from "react";
import { isTauri } from "../../services/tauri.ts";
import { useCanvasStore } from "../../stores/canvas.ts";
import { getPersistentAppState } from "../lib/canvasState.ts";

type UseCanvasExportsReturn = {
	handleExportToJSON: () => Promise<void>;
	handleImportFromJSON: () => Promise<void>;
	handleExportToPNG: () => Promise<void>;
	handleExportToSVG: () => Promise<void>;
};

function parseImportedFile(content: string): {
	elements: unknown;
	appState: unknown;
} | null {
	try {
		const parsed: unknown = JSON.parse(content);
		if (
			parsed === null ||
			Object.prototype.toString.call(parsed) !== "[object Object]"
		)
			return null;
		// SAFETY: The preceding check guarantees that parsed is a non-null object.
		const obj = parsed as { elements: unknown; appState: unknown };
		return {
			elements: obj.elements,
			appState: obj.appState,
		};
	} catch {
		return null;
	}
}

export function useCanvasExports(): UseCanvasExportsReturn {
	const canvasData = useCanvasStore((s) => s.canvasData);
	const elements = useCanvasStore((s) => s.elements);
	const appState = useCanvasStore((s) => s.appState);
	const excalidrawAPI = useCanvasStore((s) => s.excalidrawAPI);

	const handleExportToJSON = useCallback(async () => {
		if (!canvasData) return;
		const exportData = {
			type: "excalidraw",
			version: 2,
			elements,
			appState,
		};
		const jsonString = JSON.stringify(exportData, null, 2);

		if (isTauri()) {
			try {
				const filePath = await save({
					title: "Export Drawing",
					defaultPath: `${canvasData.title || "untitled"}.excalidraw`,
					filters: [
						{ name: "Excalidraw Drawing", extensions: ["excalidraw", "json"] },
					],
				});
				if (filePath) {
					await writeTextFile(filePath, jsonString);
				}
				return;
			} catch (error) {
				console.error("Failed native JSON export:", error);
			}
		}

		const blob = new Blob([jsonString], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${canvasData.title || "untitled"}.excalidraw`;
		link.click();
		URL.revokeObjectURL(url);
	}, [canvasData, elements, appState]);

	const handleImportFromJSON = useCallback(async () => {
		if (isTauri()) {
			try {
				const filePath = await open({
					title: "Import Drawing",
					filters: [
						{ name: "Excalidraw Drawing", extensions: ["excalidraw", "json"] },
					],
				});
				Object.prototype.toString.call(filePath) === "[object String]";
				if (!filePath) return;
				const content = await readTextFile(filePath);
				const imported = parseImportedFile(content);
				if (imported && Array.isArray(imported.elements)) {
					if (excalidrawAPI) {
						const isAppStateObject =
							imported.appState !== null &&
							Object.prototype.toString.call(imported.appState) ===
								"[object Object]";
						const importedAppState = getPersistentAppState(
							(isAppStateObject
								? (imported.appState as Partial<AppState>)
								: {}) as Partial<AppState>,
						);

						excalidrawAPI.updateScene({
							elements: imported.elements as ExcalidrawElement[],
							appState: {
								...importedAppState,
							} as AppState,
						});

						useCanvasStore.setState({
							elements: imported.elements as ExcalidrawElement[],
							appState: importedAppState,
							saveStatus: "unsaved",
						});
					}
				} else {
					alert("Invalid Excalidraw file structure.");
				}
				return;
			} catch (error) {
				console.error("Failed native JSON import:", error);
			}
		}

		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,.excalidraw";
		input.onchange = (e: Event) => {
			const target = e.target as HTMLInputElement;
			const file = target.files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = (event) => {
				try {
					const result = event.target?.result as string;
					const imported = parseImportedFile(result);
					if (imported && Array.isArray(imported.elements)) {
						if (excalidrawAPI) {
							const isAppStateObject2 =
								imported.appState !== null &&
								Object.prototype.toString.call(imported.appState) ===
									"[object Object]";
							// SAFETY: same validation as native import path.
							const importedAppState = getPersistentAppState(
								(isAppStateObject2
									? (imported.appState as Partial<AppState>)
									: {}) as Partial<AppState>,
							);
							excalidrawAPI.updateScene({
								elements: imported.elements as ExcalidrawElement[],
								appState: {
									...importedAppState,
								} as AppState,
							});

							// SAFETY: validated array of ExcalidrawElements from trusted export format.
							useCanvasStore.setState({
								elements: imported.elements as ExcalidrawElement[],
								appState: importedAppState,
								saveStatus: "unsaved",
							});
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

			if (isTauri()) {
				try {
					const filePath = await save({
						title: "Export PNG",
						defaultPath: `${canvasData.title || "drawing"}.png`,
						filters: [{ name: "PNG Image", extensions: ["png"] }],
					});
					if (filePath) {
						const arrayBuffer = await blob.arrayBuffer();
						await writeFile(filePath, new Uint8Array(arrayBuffer));
					}
					return;
				} catch (error) {
					console.error("Failed native PNG export:", error);
				}
				return;
			}

			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${canvasData.title}.png`;
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

			if (isTauri()) {
				try {
					const filePath = await save({
						title: "Export SVG",
						defaultPath: `${canvasData.title || "drawing"}.svg`,
						filters: [{ name: "SVG Vector Image", extensions: ["svg"] }],
					});
					if (filePath) {
						await writeTextFile(filePath, svgString);
					}
					return;
				} catch (error) {
					console.error("Failed native SVG export:", error);
				}
			}

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

	return {
		handleExportToJSON,
		handleImportFromJSON,
		handleExportToPNG,
		handleExportToSVG,
	};
}
