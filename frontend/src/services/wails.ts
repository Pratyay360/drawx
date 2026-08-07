import { AppService } from "../../bindings/drawx";

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

export function sanitizeExcalidrawAppState(appState: any): any {
  if (!appState || typeof appState !== "object" || Array.isArray(appState)) {
    return {};
  }

  const { collaborators: _collaborators, ...serializableAppState } = appState;
  return serializableAppState;
}

function normalizeCanvas(canvas: any): Canvas {
  return {
    id: canvas.id,
    title: canvas.title,
    description: canvas.description,
    createdAt: canvas.createdAt ?? new Date().toISOString(),
    updatedAt: canvas.updatedAt ?? new Date().toISOString(),
    elements: Array.isArray(canvas.elements) ? canvas.elements : [],
    appState: sanitizeExcalidrawAppState(canvas.appState),
    files:
      canvas.files && typeof canvas.files === "object" && !Array.isArray(canvas.files)
        ? canvas.files
        : {},
  };
}

// API wrapper functions (SQLite via the Wails AppService)
export async function listCanvases(): Promise<Canvas[]> {
  const canvases = await AppService.ListCanvases();
  return canvases.map(normalizeCanvas);
}

export async function createCanvas(title: string): Promise<Canvas> {
  const canvas = await AppService.CreateCanvas(title);
  return normalizeCanvas(canvas);
}

export async function deleteCanvas(id: string): Promise<void> {
  await AppService.DeleteCanvas(id);
}

export async function loadCanvas(id: string): Promise<Canvas | null> {
  const result = await AppService.LoadCanvas(id);
  return result ? normalizeCanvas(result) : null;
}

export async function saveCanvas(
  id: string,
  elements: any[],
  appState: any,
  files: any,
): Promise<void> {
  const sanitizedAppState = sanitizeExcalidrawAppState(appState);
  await AppService.SaveCanvas(id, elements, sanitizedAppState, files ?? {});
}

export async function updateCanvasTitle(id: string, title: string): Promise<void> {
  await AppService.UpdateCanvasTitle(id, title);
}
