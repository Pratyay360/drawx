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

export async function listLibrariesFromDb(): Promise<ExcalidrawLibrary[]> {
  try {
    return await invoke<ExcalidrawLibrary[]>("list_libraries");
  } catch (error) {
    console.error("Failed to list libraries from database:", error);
    return [];
  }
}

export async function saveLibrariesToDb(libraries: LibraryWithContent[]): Promise<void> {
  try {
    await invoke("save_libraries", { libraries });
  } catch (error) {
    console.error("Failed to save libraries to database:", error);
    throw error;
  }
}

export async function clearStoredLibraries(): Promise<void> {
  try {
    await invoke("clear_libraries");
  } catch (error) {
    console.error("Failed to clear stored libraries:", error);
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

export async function fetchLibraryContent(library: ExcalidrawLibrary): Promise<any> {
  const contentUrl = `https://libraries.excalidraw.com/libraries/${library.source}`;
  try {
    const response = await fetch(contentUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch library content for ${library.name}:`, error);
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
    const contents = await Promise.all(batch.map((lib) => fetchLibraryContent(lib)));
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

export interface LibraryWithItems {
  library: ExcalidrawLibrary;
  /** Each entry is an array of Excalidraw elements (one reusable component). */
  items: any[][];
  /** Optional binary files (images) referenced by items. */
  files?: any;
}

/**
 * Returns libraries that have downloadable content, grouped with their items.
 * Seeds the library index from the network on first use (lazily).
 */
export async function loadLibrariesWithItems(
  onProgress?: (loaded: number, total: number) => void,
): Promise<LibraryWithItems[]> {
  let libraries = await listLibrariesFromDb();
  if (libraries.length === 0) {
    await seedLibrariesFromNetwork(onProgress);
    libraries = await listLibrariesFromDb();
  }

  const result: LibraryWithItems[] = [];
  for (const lib of libraries) {
    const content = (lib as LibraryWithContent).content;
    if (content && Array.isArray(content.libraryItems) && content.libraryItems.length > 0) {
      result.push({
        library: lib,
        items: content.libraryItems,
        files: content.files,
      });
    }
  }
  return result;
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
      lib.authors.some((author) => author.name.toLowerCase().includes(lowerQuery)),
  );
}
