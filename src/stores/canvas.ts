import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { create } from "zustand";
import {
	areAppStatesEqual,
	areElementsEqual,
	type ElementSignature,
	getPersistentAppState,
} from "../canvas/lib/canvasState.ts";
import {
	loadCanvas,
	sanitizeExcalidrawAppState,
	saveCanvas,
} from "../services/tauri.ts";

export type SaveStatus = "saved" | "unsaved" | "saving";

export type CanvasData = {
	id: string;
	title: string;
	description: string;
	createdAt: string;
	updatedAt: string;
	elements: ExcalidrawElement[];
	appState: Partial<AppState>;
};

type CanvasStore = {
	// State
	canvasData: CanvasData | null;
	elements: ExcalidrawElement[];
	appState: Partial<AppState>;
	loading: boolean;
	loadError: string | null;
	isChangingCanvas: boolean;
	saveStatus: SaveStatus;
	titleInput: string;
	isEditingTitle: boolean;
	excalidrawAPI: ExcalidrawImperativeAPI | null;

	// Actions
	fetchCanvas: (canvasId: string, isInitialMount: boolean) => Promise<void>;
	save: (canvasId: string) => Promise<void>;
	handleExcalidrawChange: (
		elements: readonly import("@excalidraw/excalidraw/element/types").OrderedExcalidrawElement[],
		appState: AppState,
		files: import("@excalidraw/excalidraw/types").BinaryFiles,
	) => void;
	setTitleInput: (title: string) => void;
	setIsEditingTitle: (editing: boolean) => void;
	setExcalidrawAPI: (api: ExcalidrawImperativeAPI | null) => void;
	reset: () => void;
};

// Track last saved data outside the store (not serializable, transient)
let lastSavedElements: ElementSignature[] = [];
let lastSavedAppState: Partial<AppState> = {};
let fetchSeq = 0;
let isSaving = false;

const initialState = {
	canvasData: null,
	elements: [] as ExcalidrawElement[],
	appState: {} as Partial<AppState>,
	loading: true,
	loadError: null as string | null,
	isChangingCanvas: false,
	saveStatus: "saved" as SaveStatus,
	titleInput: "",
	isEditingTitle: false,
	excalidrawAPI: null as ExcalidrawImperativeAPI | null,
};

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
	...initialState,

	fetchCanvas: async (canvasId, isInitialMount) => {
		const seq = ++fetchSeq;

		if (isInitialMount) {
			set({ loading: true, loadError: null });
		} else {
			set({ isChangingCanvas: true });
		}

		try {
			const data = await loadCanvas(canvasId);
			if (seq !== fetchSeq) return;

			if (data) {
				const sanitizedAppState = sanitizeExcalidrawAppState(data.appState);
				const resolvedElements = data.elements || [];

				set({
					canvasData: { ...data, appState: sanitizedAppState },
					elements: resolvedElements,
					appState: sanitizedAppState,
					titleInput: data.title,
					loadError: null,
				});

				lastSavedElements = resolvedElements.map((e) => ({
					id: e.id,
					version: e.version,
				}));
				lastSavedAppState = getPersistentAppState(sanitizedAppState);

				const api = get().excalidrawAPI;
				if (api) {
					api.updateScene({
						elements: resolvedElements,
						appState: { ...sanitizedAppState } as AppState,
					});
				}
			} else {
				set({ loadError: "Canvas not found" });
			}
		} catch (error) {
			if (seq !== fetchSeq) return;
			console.error("Failed to load canvas:", error);
			set({
				loadError:
					error instanceof Error
						? error.message
						: "Failed to load canvas — slow network, please retry",
			});
		} finally {
			if (isInitialMount) {
				set({ loading: false });
			} else {
				set({ isChangingCanvas: false });
			}
		}
	},

	save: async (canvasId) => {
		if (isSaving) return;
		isSaving = true;
		set({ saveStatus: "saving" });
		try {
			const { elements, appState } = get();
			await saveCanvas(canvasId, elements, appState);
			set({ saveStatus: "saved" });
		} catch (error) {
			console.error("Failed to save canvas:", error);
			set({ saveStatus: "unsaved" });
		} finally {
			isSaving = false;
		}
	},

	handleExcalidrawChange: (excalidrawElements, excalidrawAppState) => {
		const currentElementsSig = excalidrawElements.map((e) => ({
			id: e.id,
			version: e.version,
		}));
		const currentPersistentState = getPersistentAppState(excalidrawAppState);

		const elementsChanged = !areElementsEqual(
			currentElementsSig,
			lastSavedElements,
		);
		const appStateChanged = !areAppStatesEqual(
			currentPersistentState,
			lastSavedAppState,
		);

		if (elementsChanged || appStateChanged) {
			set({
				elements: [...excalidrawElements],
				appState: currentPersistentState,
				saveStatus: "unsaved",
			});

			lastSavedElements = currentElementsSig;
			lastSavedAppState = currentPersistentState;
		}
	},

	setTitleInput: (title) => set({ titleInput: title }),
	setIsEditingTitle: (editing) => set({ isEditingTitle: editing }),
	setExcalidrawAPI: (api) => set({ excalidrawAPI: api }),
	reset: () => {
		fetchSeq++;
		isSaving = false;
		lastSavedElements = [];
		lastSavedAppState = {};
		set(initialState);
	},
}));
