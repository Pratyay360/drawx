import {
  CaptureUpdateAction,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  MainMenu,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Sidebar } from "../components/sidebar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import type { Canvas as CanvasData } from "../services/wails";
import { ComponentsPanel } from "./components-panel";
import {
  loadCanvas,
  sanitizeExcalidrawAppState,
  saveCanvas,
  updateCanvasTitle,
} from "../services/wails";

// ── helpers ───────────────────────────────────────────────────────────────

function areElementsEqual(
  a: Pick<ExcalidrawElement, "id" | "version">[],
  b: Pick<ExcalidrawElement, "id" | "version">[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].version !== b[i].version) {
      return false;
    }
  }
  return true;
}

function areAppStatesEqual(a: any, b: any): boolean {
  return (
    a.gridSize === b.gridSize &&
    a.zenModeEnabled === b.zenModeEnabled &&
    a.gridModeEnabled === b.gridModeEnabled &&
    a.viewModeEnabled === b.viewModeEnabled
  );
}

/**
 * Files change when Excalidraw touches them (e.g. bumping `lastRetrieved` when
 * an image is rendered). We only care about content changes, so compare the
 * mime type and the data URL per file id.
 */
function getFilesSignature(files: any): Record<string, { mimeType: string; dataURL: string }> {
  const signature: Record<string, { mimeType: string; dataURL: string }> = {};
  for (const [id, file] of Object.entries(files || {})) {
    const f = file as any;
    if (f && typeof f === "object") {
      signature[id] = { mimeType: f.mimeType, dataURL: f.dataURL };
    }
  }
  return signature;
}

function areFilesEqual(
  a: Record<string, { mimeType: string; dataURL: string }>,
  b: Record<string, { mimeType: string; dataURL: string }>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const af = a[key];
    const bf = b[key];
    if (!bf || af.mimeType !== bf.mimeType || af.dataURL !== bf.dataURL) {
      return false;
    }
  }
  return true;
}

function getPersistentAppState(appState: any): any {
  if (!appState || typeof appState !== "object") return {};
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    zenModeEnabled: appState.zenModeEnabled,
    gridModeEnabled: appState.gridModeEnabled,
    viewModeEnabled: appState.viewModeEnabled,
  };
}

// ── custom hooks ──────────────────────────────────────────────────────────

function useCanvasData(canvasId: string | undefined) {
  const [data, setData] = useState<CanvasData | null>(null);
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const [appState, setAppState] = useState<any>({});
  const [files, setFiles] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [title, setTitle] = useState("");
  const isMountedRef = useRef(true);
  // Guards against out-of-order responses when switching canvases rapidly
  // (A → B → A): only the most recently requested fetch may apply its result.
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchCanvas = useCallback(async (id: string, initial: boolean) => {
    const seq = ++fetchSeqRef.current;
    if (initial) setLoading(true);
    else setChanging(true);

    try {
      const raw = await loadCanvas(id);
      if (seq !== fetchSeqRef.current) return; // superseded by a newer fetch
      if (!raw) return;
      const sanitized = sanitizeExcalidrawAppState(raw.appState);
      const resolvedElements = raw.elements || [];
      const resolvedFiles = raw.files || {};

      if (isMountedRef.current) {
        setData({ ...raw, appState: sanitized });
        setElements(resolvedElements);
        setAppState(sanitized);
        setFiles(resolvedFiles);
        setTitle(raw.title);
      }
    } catch (error) {
      console.error("Failed to load canvas:", error);
    } finally {
      // Only the most recent fetch may clear the loading/changing flags.
      if (seq === fetchSeqRef.current && isMountedRef.current) {
        if (initial) setLoading(false);
        else setChanging(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!canvasId) return;
    fetchCanvas(canvasId, true);
  }, [canvasId, fetchCanvas]);

  return {
    data,
    elements,
    setElements,
    appState,
    setAppState,
    files,
    setFiles,
    loading,
    changing,
    title,
    setTitle,
  };
}

function useAutoSave(
  canvasId: string | undefined,
  elements: ExcalidrawElement[],
  appState: any,
  files: any,
  baseline: CanvasData | null,
  isReady: boolean,
) {
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving">("saved");
  const lastSaved = useRef<{
    elements: { id: string; version: number }[];
    appState: any;
    files: Record<string, { mimeType: string; dataURL: string }>;
  }>({ elements: [], appState: {}, files: {} });
  const saving = useRef(false);

  // Seed the last-saved snapshot from the loaded canvas so opening or
  // switching to a canvas does not trigger a spurious autosave. Declared
  // before the change-detection effect so it always runs first.
  useEffect(() => {
    if (!baseline) return;
    lastSaved.current = {
      elements: (baseline.elements || []).map((e: any) => ({
        id: e.id,
        version: e.version,
      })),
      appState: getPersistentAppState(baseline.appState),
      files: getFilesSignature(baseline.files),
    };
    setStatus("saved");
  }, [baseline]);

  // update lastSaved when a save completes successfully
  const markSaved = useCallback(() => {
    lastSaved.current = {
      elements: elements.map((e) => ({ id: e.id, version: e.version })),
      appState: getPersistentAppState(appState),
      files: getFilesSignature(files),
    };
    setStatus("saved");
  }, [elements, appState, files]);

  // detect changes compared to last saved state
  useEffect(() => {
    if (!isReady || !canvasId) return;
    const currentSig = elements.map((e) => ({ id: e.id, version: e.version }));
    const currentPersistent = getPersistentAppState(appState);
    const currentFiles = getFilesSignature(files);
    const savedSig = lastSaved.current.elements;
    const savedPersistent = lastSaved.current.appState;
    const savedFiles = lastSaved.current.files;

    const changed =
      !areElementsEqual(currentSig, savedSig) ||
      !areAppStatesEqual(currentPersistent, savedPersistent) ||
      !areFilesEqual(currentFiles, savedFiles);

    if (changed) setStatus("unsaved");
  }, [elements, appState, files, isReady, canvasId]);

  // auto‑save after a debounce
  useEffect(() => {
    if (!isReady || !canvasId || status !== "unsaved") return;
    const timer = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      setStatus("saving");
      try {
        await saveCanvas(canvasId, elements, appState, files);
        markSaved();
      } catch (error) {
        console.error("Auto‑save failed:", error);
        setStatus("unsaved");
      } finally {
        saving.current = false;
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [elements, appState, files, canvasId, isReady, status, markSaved]);

  const manualSave = useCallback(async () => {
    if (!isReady || !canvasId || status === "saved" || saving.current) return;
    saving.current = true;
    setStatus("saving");
    try {
      await saveCanvas(canvasId, elements, appState, files);
      markSaved();
    } catch (error) {
      console.error("Manual save failed:", error);
      setStatus("unsaved");
    } finally {
      saving.current = false;
    }
  }, [canvasId, elements, appState, files, isReady, status, markSaved]);

  return { status, manualSave, markSaved };
}

// ── main component ────────────────────────────────────────────────────────

export function Canvas() {
  const { id } = useParams<{ id: string }>();

  const {
    data: canvasData,
    elements,
    setElements,
    appState,
    setAppState,
    files,
    setFiles,
    loading,
    changing,
    title,
    setTitle,
  } = useCanvasData(id);

  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(title);
  const [showComponents, setShowComponents] = useState(false);

  const isReady = !loading && !changing && !!id && !!excalidrawAPI;

  const { status: saveStatus, manualSave } = useAutoSave(
    id,
    elements,
    appState,
    files,
    canvasData,
    isReady,
  );

  // ── callbacks ────────────────────────────────────────────────────────────

  const handleExcalidrawChange = useCallback(
    (newElements: readonly ExcalidrawElement[], newAppState: any, newFiles: any) => {
      if (!isReady) return;
      setElements([...newElements]);
      setAppState(getPersistentAppState(newAppState));
      setFiles(newFiles || {});
    },
    [isReady, setElements, setAppState, setFiles],
  );

  // Apply the loaded scene on canvas-to-canvas navigation. `initialData` is
  // only read once by Excalidraw (on mount), so later snapshots must be pushed
  // via `updateScene` and `addFiles`. The very first load is skipped because
  // `initialData` already handles it. `captureUpdate: NEVER` keeps loads out
  // of undo/redo.
  const lastAppliedCanvasId = useRef<string | null>(id ?? null);
  useEffect(() => {
    if (!excalidrawAPI || !canvasData) return;
    if (lastAppliedCanvasId.current === canvasData.id) return;
    lastAppliedCanvasId.current = canvasData.id;

    excalidrawAPI.updateScene({
      elements: canvasData.elements,
      appState: canvasData.appState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    // `addFiles` only merges, so files from previously opened canvases stay in
    // Excalidraw's internal map; file ids are unique per paste, so this only
    // costs a little memory, never rendering correctness.
    const fileList: any[] = Object.values(canvasData.files || {});
    if (fileList.length > 0) excalidrawAPI.addFiles(fileList);
  }, [excalidrawAPI, canvasData]);

  const handleTitleSave = useCallback(async () => {
    if (!id || !titleInput.trim()) return;
    try {
      await updateCanvasTitle(id, titleInput.trim());
      setTitle(titleInput.trim());
      setIsEditingTitle(false);
      globalThis.dispatchEvent(new Event("canvas-updated"));
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  }, [id, titleInput, setTitle]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleTitleSave();
      else if (e.key === "Escape") {
        setTitleInput(title);
        setIsEditingTitle(false);
      }
    },
    [handleTitleSave, title],
  );

  // ── export handlers ─────────────────────────────────────────────────────

  const handleExportJSON = useCallback(() => {
    if (!canvasData) return;
    const payload = {
      type: "excalidraw",
      version: 2,
      elements,
      appState,
      files,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${canvasData.title || "untitled"}.excalidraw`;
    a.click();
    URL.revokeObjectURL(url);
  }, [canvasData, elements, appState, files]);

  const handleImportJSON = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.excalidraw";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          if (imported && Array.isArray(imported.elements)) {
            const importedAppState = getPersistentAppState(imported.appState || {});
            const importedFiles =
              imported.files &&
              typeof imported.files === "object" &&
              !Array.isArray(imported.files)
                ? imported.files
                : {};
            excalidrawAPI?.updateScene({
              elements: imported.elements,
              appState: importedAppState,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
            const fileList: any[] = Object.values(importedFiles);
            if (fileList.length > 0) excalidrawAPI?.addFiles(fileList);
            setElements(imported.elements);
            setAppState(importedAppState);
            setFiles(importedFiles);
          } else {
            alert("Invalid Excalidraw file structure.");
          }
        } catch (err) {
          console.error("Import failed:", err);
          alert("Failed to parse the imported file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [excalidrawAPI, setElements, setAppState, setFiles]);

  const handleExportPNG = useCallback(async () => {
    if (!excalidrawAPI || !canvasData) return;
    try {
      const blob = await exportToBlob({
        elements: excalidrawAPI.getSceneElements(),
        appState: excalidrawAPI.getAppState(),
        mimeType: "image/png",
        exportPadding: 15,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${canvasData.title || "drawing"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PNG export failed:", error);
    }
  }, [excalidrawAPI, canvasData]);

  const handleExportSVG = useCallback(async () => {
    if (!excalidrawAPI || !canvasData) return;
    try {
      const svg = await exportToSvg({
        elements: excalidrawAPI.getSceneElements(),
        appState: excalidrawAPI.getAppState(),
        exportPadding: 15,
      });
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${canvasData.title || "drawing"}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("SVG export failed:", error);
    }
  }, [excalidrawAPI, canvasData]);

  // ── loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-screen font-sans bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center bg-card">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        </main>
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen font-sans overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 py-1.5 z-20 shrink-0 border-b bg-card">
          <div className="flex items-center gap-2 max-w-[60%]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/"
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon icon="lucide:arrow-left" className="w-4 h-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Back to workspace</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="w-px h-4 shrink-0 bg-border" />

            {isEditingTitle ? (
              <Input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleTitleSave}
                className="h-7 text-sm font-medium px-1.5 max-w-62.5"
                autoFocus
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTitleInput(title);
                  setIsEditingTitle(true);
                }}
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-sm font-medium truncate group h-auto"
                title="Click to rename"
              >
                <span className="truncate">{title || "Untitled"}</span>
                <Icon
                  icon="lucide:pencil"
                  className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground"
                />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs mr-1 hidden sm:inline text-muted-foreground">
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "Saved"}
              {saveStatus === "unsaved" && "Unsaved"}
            </span>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showComponents ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowComponents((open) => !open)}
                    aria-label="Components"
                    aria-pressed={showComponents}
                  >
                    <Icon icon="lucide:shapes" className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Components</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={manualSave}
                    disabled={saveStatus === "saving" || saveStatus === "saved"}
                  >
                    {saveStatus === "saving" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon icon="lucide:save" className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Excalidraw board */}
        <div className="flex-1 w-full h-full min-h-0 relative z-10">
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            theme="dark"
            initialData={{
              elements,
              appState,
              files,
            }}
            onChange={handleExcalidrawChange}
          >
            <MainMenu>
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.Item
                onSelect={handleExportJSON}
                icon={<Icon icon="lucide:download" className="w-4 h-4" />}
              >
                Export File (.excalidraw)
              </MainMenu.Item>
              <MainMenu.Item
                onSelect={handleImportJSON}
                icon={<Icon icon="lucide:upload" className="w-4 h-4" />}
              >
                Import File (.excalidraw)
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.Item
                onSelect={handleExportPNG}
                icon={<Icon icon="lucide:image" className="w-4 h-4" />}
              >
                Export as PNG
              </MainMenu.Item>
              <MainMenu.Item
                onSelect={handleExportSVG}
                icon={<Icon icon="lucide:file-code" className="w-4 h-4" />}
              >
                Export as SVG
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Logo>
                  <Icon icon="lucide:pen-tool" className="w-8 h-8 text-primary mx-auto mb-1" />
                </WelcomeScreen.Center.Logo>
                <WelcomeScreen.Center.Heading>Drawx</WelcomeScreen.Center.Heading>
                <WelcomeScreen.Center.MenuItemHelp />
                <div className="text-xs max-w-xs mx-auto mt-2 text-muted-foreground">
                  Sketch, add shapes, or use templates. Changes save automatically.
                </div>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>

          {changing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {showComponents && (
            <ComponentsPanel
              excalidrawAPI={excalidrawAPI}
              onClose={() => setShowComponents(false)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
