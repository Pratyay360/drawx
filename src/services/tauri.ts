import { invoke } from "@tauri-apps/api/core";

export interface Canvas {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  elements: any[];
  appState: any;
}

type RawCanvas = Canvas & {
  created_at?: string;
  updated_at?: string;
  app_state?: any;
};

export function sanitizeExcalidrawAppState(appState: any): any {
  if (!appState || typeof appState !== "object" || Array.isArray(appState)) {
    return {};
  }

  const { collaborators: _collaborators, ...serializableAppState } = appState;
  return serializableAppState;
}

function normalizeCanvas(canvas: RawCanvas): Canvas {
  return {
    id: canvas.id,
    title: canvas.title,
    description: canvas.description,
    createdAt: canvas.createdAt ?? canvas.created_at ?? new Date().toISOString(),
    updatedAt: canvas.updatedAt ?? canvas.updated_at ?? new Date().toISOString(),
    elements: Array.isArray(canvas.elements) ? canvas.elements : [],
    appState: sanitizeExcalidrawAppState(canvas.appState ?? canvas.app_state),
  };
}

// Check if we are running inside Tauri
export function isTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
}

// Local storage helper key
const LOCAL_STORAGE_KEY = "drawx_canvases";

function getLocalStorageCanvases(): Canvas[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    const canvases = data ? JSON.parse(data) : [];
    return Array.isArray(canvases) ? canvases.map(normalizeCanvas) : [];
  } catch (error) {
    console.error("Failed to parse local storage canvases:", error);
    return [];
  }
}

function saveLocalStorageCanvases(canvases: Canvas[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(canvases));
  } catch (error) {
    console.error("Failed to save canvases to local storage:", error);
  }
}

// API wrapper functions
export async function listCanvases(): Promise<Canvas[]> {
  if (isTauri()) {
    const canvases = await invoke<RawCanvas[]>("list_canvases");
    return canvases.map(normalizeCanvas);
  } else {
    return getLocalStorageCanvases();
  }
}

export async function createCanvas(title: string): Promise<Canvas> {
  if (isTauri()) {
    const canvas = await invoke<RawCanvas>("create_canvas", { title });
    return normalizeCanvas(canvas);
  } else {
    const canvases = getLocalStorageCanvases();
    const newCanvas: Canvas = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title,
      description: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elements: [],
      appState: {},
    };
    canvases.push(newCanvas);
    saveLocalStorageCanvases(canvases);
    return newCanvas;
  }
}

export async function deleteCanvas(id: string): Promise<void> {
  if (isTauri()) {
    await invoke("delete_canvas", { id });
  } else {
    const canvases = getLocalStorageCanvases();
    const filtered = canvases.filter((c) => c.id !== id);
    saveLocalStorageCanvases(filtered);
  }
}

export async function loadCanvas(id: string): Promise<Canvas | null> {
  if (isTauri()) {
    const result = await invoke<RawCanvas | null>("load_canvas", { id });
    return result ? normalizeCanvas(result) : null;
  } else {
    const canvases = getLocalStorageCanvases();
    return canvases.find((c) => c.id === id) || null;
  }
}

export async function saveCanvas(id: string, elements: any[], appState: any): Promise<void> {
  const sanitizedAppState = sanitizeExcalidrawAppState(appState);

  if (isTauri()) {
    await invoke("save_canvas", { id, elements, appState: sanitizedAppState });
  } else {
    const canvases = getLocalStorageCanvases();
    const index = canvases.findIndex((c) => c.id === id);
    if (index !== -1) {
      canvases[index].elements = elements;
      canvases[index].appState = sanitizedAppState;
      canvases[index].updatedAt = new Date().toISOString();
      saveLocalStorageCanvases(canvases);
    }
  }
}

export async function updateCanvasTitle(id: string, title: string): Promise<void> {
  if (isTauri()) {
    await invoke("update_canvas_title", { id, title });
  } else {
    const canvases = getLocalStorageCanvases();
    const index = canvases.findIndex((c) => c.id === id);
    if (index !== -1) {
      canvases[index].title = title;
      canvases[index].updatedAt = new Date().toISOString();
      saveLocalStorageCanvases(canvases);
    }
  }
}
