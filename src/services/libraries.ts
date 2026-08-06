import { invoke } from "@tauri-apps/api/core";

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

export interface LibraryWithContent extends ExcalidrawLibrary {
	content?: any;
}

const LIBRARIES_API_URL = "https://libraries.excalidraw.com/libraries.json";
const LOCAL_STORAGE_KEY = "drawx_libraries";

// Check if we are running inside Tauri
function isTauri(): boolean {
	return (
		typeof window !== "undefined" &&
		(window as any).__TAURI_INTERNALS__ !== undefined
	);
}

function getLocalStorageLibraries(): ExcalidrawLibrary[] {
	try {
		const data = localStorage.getItem(LOCAL_STORAGE_KEY);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("Failed to parse local storage libraries:", error);
		return [];
	}
}

function saveLocalStorageLibraries(libraries: LibraryWithContent[]): void {
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(libraries));
	} catch (error) {
		console.error("Failed to save libraries to local storage:", error);
	}
}

export async function listLibrariesFromDb(): Promise<ExcalidrawLibrary[]> {
	try {
		if (isTauri()) {
			return await invoke<ExcalidrawLibrary[]>("list_libraries");
		}
		return getLocalStorageLibraries();
	} catch (error) {
		console.error("Failed to list libraries from database:", error);
		return [];
	}
}

export async function saveLibrariesToDb(
	libraries: LibraryWithContent[],
): Promise<void> {
	try {
		if (isTauri()) {
			await invoke("save_libraries", { libraries });
		} else {
			saveLocalStorageLibraries(libraries);
		}
	} catch (error) {
		console.error("Failed to save libraries to database:", error);
		throw error;
	}
}

export async function clearStoredLibraries(): Promise<void> {
	try {
		if (isTauri()) {
			await invoke("clear_libraries");
		} else {
			localStorage.removeItem(LOCAL_STORAGE_KEY);
		}
	} catch (error) {
		console.error("Failed to clear stored libraries:", error);
	}
}

export async function loadAllLibraryItemsFromDb(): Promise<any[]> {
	try {
		if (isTauri()) {
			return await invoke<any[]>("load_all_library_items");
		}
		// Non-Tauri fallback: extract libraryItems from stored content
		const libraries = getLocalStorageLibraries();
		const allItems: any[] = [];
		for (const lib of libraries) {
			const libWithContent = lib as LibraryWithContent;
			if (libWithContent.content?.libraryItems) {
				allItems.push(...libWithContent.content.libraryItems);
			}
		}
		return allItems;
	} catch (error) {
		console.error("Failed to load library items from database:", error);
		return [];
	}
}

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

export async function seedLibrariesFromNetwork(
	onProgress?: (loaded: number, total: number) => void,
): Promise<LibraryWithContent[]> {
	const libraries = await fetchLibraries();
	if (libraries.length === 0) return [];

	const stored: LibraryWithContent[] = [];

	const BATCH = 10;
	for (let i = 0; i < libraries.length; i += BATCH) {
		const batch = libraries.slice(i, i + BATCH);
		const contents = await Promise.all(
			batch.map((lib) => fetchLibraryContent(lib)),
		);
		batch.forEach((lib, index) => {
			stored.push({
				...lib,
				content: contents[index] ?? null,
			});
		});
		onProgress?.(Math.min(i + BATCH, libraries.length), libraries.length);
	}

	await saveLibrariesToDb(stored);
	return stored;
}

export async function loadAllLibraryItems(
	onProgress?: (loaded: number, total: number) => void,
): Promise<any[]> {
	const storedItems = await loadAllLibraryItemsFromDb();
	if (storedItems.length > 0) return storedItems;

	await seedLibrariesFromNetwork(onProgress);
	return loadAllLibraryItemsFromDb();
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
