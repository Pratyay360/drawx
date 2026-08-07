import { invoke } from "@tauri-apps/api/core";

export interface Canvas {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  elements: any[];
  appState: any;
  /** Excalidraw binary files map (keyed by file/element id). */
  files?: any;
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
    files:
      canvas.files && typeof canvas.files === "object" && !Array.isArray(canvas.files)
        ? canvas.files
        : {},
  };
}

// API wrapper functions (SQLite via Tauri)
export async function listCanvases(): Promise<Canvas[]> {
  const canvases = await invoke<RawCanvas[]>("list_canvases");
  return canvases.map(normalizeCanvas);
}

export async function createCanvas(title: string): Promise<Canvas> {
  const canvas = await invoke<RawCanvas>("create_canvas", { title });
  return normalizeCanvas(canvas);
}

export async function deleteCanvas(id: string): Promise<void> {
  await invoke("delete_canvas", { id });
}

export async function loadCanvas(id: string): Promise<Canvas | null> {
  const result = await invoke<RawCanvas | null>("load_canvas", { id });
  return result ? normalizeCanvas(result) : null;
}

export async function saveCanvas(
  id: string,
  elements: any[],
  appState: any,
  files: any,
): Promise<void> {
  const sanitizedAppState = sanitizeExcalidrawAppState(appState);
  await invoke("save_canvas", { id, elements, appState: sanitizedAppState, files });
}

export async function updateCanvasTitle(id: string, title: string): Promise<void> {
  await invoke("update_canvas_title", { id, title });
}
