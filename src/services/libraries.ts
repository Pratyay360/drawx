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

export async function loadAllLibraryItems(
	onProgress?: (loaded: number, total: number) => void,
): Promise<any[]> {
	const libraries = await fetchLibraries();
	const allItems: any[] = [];

	const BATCH = 10;
	for (let i = 0; i < libraries.length; i += BATCH) {
		const batch = libraries.slice(i, i + BATCH);
		const contents = await Promise.all(
			batch.map((lib) => fetchLibraryContent(lib)),
		);
		contents.forEach((content) => {
			if (content?.libraryItems) {
				allItems.push(...content.libraryItems);
			}
		});
		onProgress?.(Math.min(i + BATCH, libraries.length), libraries.length);
	}

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
