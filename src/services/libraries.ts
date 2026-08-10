import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";

export interface ExcalidrawLibrary {
	name: string;
	description: string;
	authors: { name: string; url?: string }[];
	source: string;
	preview: string;
	created: string;
	updated: string;
	version: number;
	id: string;
	itemNames?: string[];
}

export interface SavedLibrary {
	id: string;
	name: string;
	description: string;
	authors: { name: string; url?: string }[];
	source: string;
	preview: string;
	created: string;
	updated: string;
	version: number;
	item_names: string[];
}

const LIBRARIES_API_URL = "https://libraries.excalidraw.com/libraries.json";

const SAVED_LIBRARIES_KEY = "drawx_saved_libraries";

const LIBRARY_CONFIG_UPDATED_EVENT = "library-config-updated";

function notifyLibraryConfigUpdated() {
	window.dispatchEvent(new Event(LIBRARY_CONFIG_UPDATED_EVENT));
}

// In-memory cache only — library item content is never persisted to disk.
let memoryCache: { key: string; items: any[] } | null = null;

export async function fetchLibraries(): Promise<ExcalidrawLibrary[]> {
	try {
		const response = await fetch(LIBRARIES_API_URL);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		return await response.json();
	} catch (error) {
		console.error("Failed to fetch libraries:", error);
		return [];
	}
}

export async function fetchLibraryContent(
	library: ExcalidrawLibrary,
): Promise<any> {
	const contentUrl = `https://libraries.excalidraw.com/libraries/${library.source}`;
	try {
		const response = await fetch(contentUrl);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
		return await response.json();
	} catch (error) {
		console.error(
			`Failed to fetch library content for ${library.name}:`,
			error,
		);
		return null;
	}
}

export async function getSavedLibraries(): Promise<SavedLibrary[]> {
	if (isTauri()) {
		try {
			return await invoke<SavedLibrary[]>("get_saved_libraries");
		} catch (error) {
			console.error("Failed to load saved libraries:", error);
			return [];
		}
	}
	try {
		const data = localStorage.getItem(SAVED_LIBRARIES_KEY);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("Failed to parse saved libraries:", error);
		return [];
	}
}

export async function saveLibraryToConfig(library: SavedLibrary): Promise<void> {
	if (isTauri()) {
		await invoke("save_library", { library });
	} else {
		const saved = await getSavedLibraries();
		const next = saved.filter((lib) => lib.id !== library.id);
		next.push(library);
		localStorage.setItem(SAVED_LIBRARIES_KEY, JSON.stringify(next));
	}
	notifyLibraryConfigUpdated();
}

export async function removeLibraryFromConfig(id: string): Promise<void> {
	if (isTauri()) {
		await invoke("remove_saved_library", { id });
	} else {
		const saved = await getSavedLibraries();
		localStorage.setItem(
			SAVED_LIBRARIES_KEY,
			JSON.stringify(saved.filter((lib) => lib.id !== id)),
		);
	}
	notifyLibraryConfigUpdated();
}

export function onLibraryConfigUpdated(callback: () => void): () => void {
	window.addEventListener(LIBRARY_CONFIG_UPDATED_EVENT, callback);
	return () => window.removeEventListener(LIBRARY_CONFIG_UPDATED_EVENT, callback);
}

export async function loadAllLibraryItems(
	onProgress?: (loaded: number, total: number) => void,
): Promise<any[]> {
	const saved = await getSavedLibraries();
	const key = saved.map((lib) => lib.id).sort().join(",");
	if (memoryCache && memoryCache.key === key) {
		return memoryCache.items;
	}

	const allItems: any[] = [];

	const BATCH = 10;
	for (let i = 0; i < saved.length; i += BATCH) {
		const batch = saved.slice(i, i + BATCH);
		const contents = await Promise.all(
			batch.map((lib) => fetchLibraryContent(lib)),
		);
		contents.forEach((content) => {
			if (content?.libraryItems) {
				allItems.push(...content.libraryItems);
			}
		});
		onProgress?.(Math.min(i + BATCH, saved.length), saved.length);
	}

	memoryCache = { key, items: allItems };
	return allItems;
}

export function searchLibraries(
	libraries: ExcalidrawLibrary[],
	query: string,
): ExcalidrawLibrary[] {
	const lowerQuery = query.toLowerCase();
	return libraries.filter(
		(lib) =>
			lib.name.toLowerCase().includes(lowerQuery) ||
			lib.description.toLowerCase().includes(lowerQuery) ||
			lib.authors.some((author) =>
				author.name.toLowerCase().includes(lowerQuery),
			),
	);
}
