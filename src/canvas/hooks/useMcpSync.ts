import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isTauri, syncActiveCanvas } from "../../services/tauri.ts";
import { useCanvasStore } from "../../stores/canvas.ts";

export function useMcpSync(
	id: string | undefined,
	title: string | undefined,
	elements: ExcalidrawElement[],
	appState: Partial<AppState>,
) {
	const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 1. Listen for incoming AI events from Tauri MCP server
	useEffect(() => {
		if (!isTauri()) return;

		let isMounted = true;
		let unlistenAdd: (() => void) | undefined;
		let unlistenClear: (() => void) | undefined;

		async function setupListeners() {
			try {
				unlistenAdd = await listen<ExcalidrawElement[]>(
					"drawx://mcp-add-elements",
					(event) => {
						if (!isMounted) return;
						const newElements = event.payload;
						if (!Array.isArray(newElements) || newElements.length === 0) return;

						const currentStore = useCanvasStore.getState();
						const api = currentStore.excalidrawAPI;
						const currentElements = currentStore.elements;
						const merged = [...currentElements, ...newElements];

						if (api) {
							api.updateScene({ elements: merged });
						}
						useCanvasStore.setState({
							elements: merged,
							saveStatus: "unsaved",
						});
					},
				);

				unlistenClear = await listen("drawx://mcp-clear-canvas", () => {
					if (!isMounted) return;
					const currentStore = useCanvasStore.getState();
					const api = currentStore.excalidrawAPI;
					if (api) {
						api.updateScene({ elements: [] });
					}
					useCanvasStore.setState({
						elements: [],
						saveStatus: "unsaved",
					});
				});
			} catch (error) {
				console.error("Failed to setup MCP event listeners:", error);
			}
		}

		void setupListeners();

		return () => {
			isMounted = false;
			if (unlistenAdd) unlistenAdd();
			if (unlistenClear) unlistenClear();
		};
	}, []);

	// 2. Sync active canvas state to Rust (debounced to avoid spam during interactive drawing)
	useEffect(() => {
		if (!isTauri() || !id) return;

		if (syncTimerRef.current !== null) {
			clearTimeout(syncTimerRef.current);
		}

		syncTimerRef.current = setTimeout(() => {
			void syncActiveCanvas(id, title || "Untitled Canvas", elements, appState);
		}, 1000);

		return () => {
			if (syncTimerRef.current !== null) {
				clearTimeout(syncTimerRef.current);
			}
		};
	}, [id, title, elements, appState]);
}
