import { create } from "zustand";
import { withTimeout } from "../lib/async.ts";
import type { Canvas } from "../services/tauri.ts";
import {
	createCanvas,
	deleteCanvas,
	listCanvases,
	updateCanvasTitle,
} from "../services/tauri.ts";

export type ViewMode = "grid" | "list";

type DashboardStore = {
	// State
	canvases: Canvas[];
	isLoading: boolean;
	loadError: string | null;
	searchQuery: string;
	viewMode: ViewMode;
	editingId: string | null;
	editTitle: string;
	deletingId: string | null;
	isCreating: boolean;

	// Actions
	reload: () => Promise<void>;
	createNewCanvas: (title: string) => Promise<Canvas>;
	deleteCanvasById: (id: string) => Promise<void>;
	renameCanvas: (id: string, title: string) => Promise<void>;
	setSearchQuery: (query: string) => void;
	setViewMode: (mode: ViewMode) => void;
	startEditing: (id: string, title: string) => void;
	cancelEditing: () => void;
	setEditTitle: (title: string) => void;
};

let loadSeq = 0;

export const useDashboardStore = create<DashboardStore>()((set, get) => ({
	// State
	canvases: [],
	isLoading: true,
	loadError: null,
	searchQuery: "",
	viewMode: "grid",
	editingId: null,
	editTitle: "",
	deletingId: null,
	isCreating: false,

	// Actions
	reload: async () => {
		const seq = ++loadSeq;
		const hasStale = get().canvases.length > 0;
		if (!hasStale) set({ isLoading: true });
		set({ loadError: null });
		try {
			const result = await withTimeout(
				listCanvases(),
				12000,
				"Loading canvases",
			);
			if (seq !== loadSeq) return;
			set({ canvases: result, loadError: null });
		} catch (error) {
			if (seq !== loadSeq) return;
			console.error("Failed to load drawings:", error);
			set({
				loadError:
					error instanceof Error
						? error.message
						: "Failed to load canvases — slow network, please retry",
			});
		} finally {
			if (seq === loadSeq) set({ isLoading: false });
		}
	},

	createNewCanvas: async (title) => {
		set({ isCreating: true });
		try {
			const newCanvas = await withTimeout(
				createCanvas(title),
				12000,
				"Create canvas",
			);
			globalThis.dispatchEvent(new Event("canvas-updated"));
			return newCanvas;
		} finally {
			set({ isCreating: false });
		}
	},

	deleteCanvasById: async (id) => {
		set({ deletingId: id });
		try {
			await withTimeout(deleteCanvas(id), 12000, "Delete canvas");
			globalThis.dispatchEvent(new Event("canvas-updated"));
			await get().reload();
		} finally {
			set({ deletingId: null });
		}
	},

	renameCanvas: async (id, title) => {
		if (!title.trim()) return;
		try {
			await withTimeout(
				updateCanvasTitle(id, title.trim()),
				12000,
				"Rename canvas",
			);
			set({ editingId: null });
			globalThis.dispatchEvent(new Event("canvas-updated"));
			await get().reload();
		} catch (error) {
			console.error("Failed to rename canvas:", error);
		}
	},

	setSearchQuery: (query) => set({ searchQuery: query }),
	setViewMode: (mode) => set({ viewMode: mode }),
	startEditing: (id, title) => set({ editingId: id, editTitle: title }),
	cancelEditing: () => set({ editingId: null }),
	setEditTitle: (title) => set({ editTitle: title }),
}));
