import { useEffect, useRef } from "react";
import { useCanvasStore } from "../../stores/canvas.ts";

export function useCanvasData(id: string | undefined) {
	// Subscribe to store state
	const canvasData = useCanvasStore((s) => s.canvasData);
	const elements = useCanvasStore((s) => s.elements);
	const appState = useCanvasStore((s) => s.appState);
	const loading = useCanvasStore((s) => s.loading);
	const loadError = useCanvasStore((s) => s.loadError);
	const isChangingCanvas = useCanvasStore((s) => s.isChangingCanvas);
	const saveStatus = useCanvasStore((s) => s.saveStatus);
	const titleInput = useCanvasStore((s) => s.titleInput);
	const isEditingTitle = useCanvasStore((s) => s.isEditingTitle);
	const excalidrawAPI = useCanvasStore((s) => s.excalidrawAPI);

	// Get actions (stable references, no re-renders)
	const fetchCanvas = useCanvasStore((s) => s.fetchCanvas);
	const save = useCanvasStore((s) => s.save);
	const handleExcalidrawChange = useCanvasStore(
		(s) => s.handleExcalidrawChange,
	);
	const reset = useCanvasStore((s) => s.reset);
	const setTitleInput = useCanvasStore((s) => s.setTitleInput);
	const setIsEditingTitle = useCanvasStore((s) => s.setIsEditingTitle);
	const setExcalidrawAPI = useCanvasStore((s) => s.setExcalidrawAPI);

	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Fetch canvas on mount / ID change
	useEffect(() => {
		if (!id) return;
		reset();
		void fetchCanvas(id, true);
	}, [id, reset, fetchCanvas]);

	// Auto-save: debounce 1.5s after unsaved changes
	useEffect(() => {
		if (loading || isChangingCanvas || !id || saveStatus !== "unsaved") return;

		autoSaveTimerRef.current = globalThis.setTimeout(() => {
			void save(id);
		}, 1500);

		return () => {
			if (autoSaveTimerRef.current !== null) {
				globalThis.clearTimeout(autoSaveTimerRef.current);
			}
		};
	}, [id, loading, isChangingCanvas, saveStatus, save]);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (autoSaveTimerRef.current !== null) {
				globalThis.clearTimeout(autoSaveTimerRef.current);
			}
		};
	}, []);

	return {
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
	};
}
