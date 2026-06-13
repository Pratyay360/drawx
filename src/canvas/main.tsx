import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  MainMenu,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import { Icon } from "@iconify/react";
import { Sidebar } from "../components/sidebar.tsx";
import { useTheme } from "../theme-context.tsx";
import "@excalidraw/excalidraw/index.css";
import "../styles/theme.css";
import "../styles/variables.module.css";

import {
  Canvas as CanvasData,
  loadCanvas,
  sanitizeExcalidrawAppState,
  saveCanvas,
  updateCanvasTitle,
} from "../services/tauri.ts";

function areElementsEqual(a: any[], b: any[]): boolean {
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
    a.theme === b.theme &&
    a.viewBackgroundColor === b.viewBackgroundColor &&
    a.gridSize === b.gridSize &&
    a.zenModeEnabled === b.zenModeEnabled &&
    a.gridModeEnabled === b.gridModeEnabled &&
    a.viewModeEnabled === b.viewModeEnabled
  );
}

function getPersistentAppState(appState: any): any {
  if (!appState || typeof appState !== "object") return {};
  return {
    theme: appState.theme,
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    zenModeEnabled: appState.zenModeEnabled,
    gridModeEnabled: appState.gridModeEnabled,
    viewModeEnabled: appState.viewModeEnabled,
  };
}

export function Canvas() {
  const { id } = useParams<{ id: string }>();
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isChangingCanvas, setIsChangingCanvas] = useState(false);
  const [elements, setElements] = useState<any[]>([]);
  const [appState, setAppState] = useState<any>({});
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const { theme, toggleTheme } = useTheme();

  // Save status: "saved" | "unsaved" | "saving"
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  const lastSavedData = useRef<{
    elements: { id: string; version: number }[];
    appState: any;
  }>({
    elements: [],
    appState: {},
  });

  const isSavingRef = useRef(false);

  // Load canvas data
  const fetchCanvas = useCallback(
    async (canvasId: string, isInitialMount: boolean) => {
      if (isInitialMount) {
        setLoading(true);
      } else {
        setIsChangingCanvas(true);
      }

      try {
        const data = await loadCanvas(canvasId);
        if (data) {
          const sanitizedAppState = sanitizeExcalidrawAppState(data.appState);
          const resolvedElements = data.elements || [];

          setCanvasData({ ...data, appState: sanitizedAppState });
          setElements(resolvedElements);
          setAppState(sanitizedAppState);
          setTitleInput(data.title);

          // Update comparison references
          lastSavedData.current = {
            elements: resolvedElements.map((e: any) => ({
              id: e.id,
              version: e.version,
            })),
            appState: getPersistentAppState(sanitizedAppState),
          };

          // If Excalidraw is already mounted, update the scene smoothly
          if (excalidrawAPI) {
            excalidrawAPI.updateScene({
              elements: resolvedElements,
              appState: {
                ...sanitizedAppState,
                viewBackgroundColor:
                  sanitizedAppState.viewBackgroundColor ||
                  (theme === "dark" ? "#1e1e1e" : "#ffffff"),
              },
            });
          }
        }
      } catch (error) {
        console.error("Failed to load canvas:", error);
      } finally {
        if (isInitialMount) {
          setLoading(false);
        } else {
          setIsChangingCanvas(false);
        }
      }
    },
    [excalidrawAPI, theme],
  );

  // Load canvas data on mount/id change
  useEffect(() => {
    if (!id) return;
    setSaveStatus("saved");
    const isInitialMount = !excalidrawAPI;
    fetchCanvas(id, isInitialMount);
  }, [id, fetchCanvas]);

  // Debounced auto-save effect
  useEffect(() => {
    if (loading || isChangingCanvas || !id || saveStatus !== "unsaved") return;

    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      isSavingRef.current = true;
      try {
        await saveCanvas(id, elements, appState);
        setSaveStatus("saved");
      } catch (error) {
        console.error("Failed to auto-save canvas:", error);
        setSaveStatus("unsaved");
      } finally {
        isSavingRef.current = false;
      }
    }, 1500); // 1.5 second debounce

    return () => clearTimeout(timer);
  }, [elements, appState, id, loading, isChangingCanvas, saveStatus]);

  // Handle manual save
  const handleManualSave = useCallback(async () => {
    if (!id || isSavingRef.current || saveStatus !== "unsaved") return;

    setSaveStatus("saving");
    isSavingRef.current = true;
    try {
      await saveCanvas(id, elements, appState);
      setSaveStatus("saved");
    } catch (error) {
      console.error("Failed to save canvas:", error);
      setSaveStatus("unsaved");
    } finally {
      isSavingRef.current = false;
    }
  }, [id, elements, appState, saveStatus]);

  // Handle Excalidraw changes
  const handleExcalidrawChange = useCallback(
    (excalidrawElements: readonly any[], excalidrawAppState: any, _files: any) => {
      // Avoid triggering changes if loading, changing canvas, or elements/state aren't initialized
      if (loading || isChangingCanvas) return;

      const currentElementsSig = excalidrawElements.map((e) => ({
        id: e.id,
        version: e.version,
      }));
      const currentPersistentState = getPersistentAppState(excalidrawAppState);

      const savedElementsSig = lastSavedData.current?.elements || [];
      const savedPersistentState = lastSavedData.current?.appState || {};

      const elementsChanged = !areElementsEqual(currentElementsSig, savedElementsSig);
      const appStateChanged = !areAppStatesEqual(currentPersistentState, savedPersistentState);

      if (elementsChanged || appStateChanged) {
        setElements([...excalidrawElements]);
        setAppState(currentPersistentState);
        setSaveStatus("unsaved");

        // Keep comparison reference matching current state
        lastSavedData.current = {
          elements: currentElementsSig,
          appState: currentPersistentState,
        };
      }
    },
    [loading, isChangingCanvas],
  );

  // Rename Title
  async function handleTitleSave() {
    if (!id || !titleInput.trim()) return;
    try {
      await updateCanvasTitle(id, titleInput.trim());
      if (canvasData) {
        setCanvasData({ ...canvasData, title: titleInput.trim() });
      }
      setIsEditingTitle(false);
      window.dispatchEvent(new Event("canvas-updated"));
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setTitleInput(canvasData?.title || "");
      setIsEditingTitle(false);
    }
  }

  // Toggle theme and sync to Excalidraw
  const handleToggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    toggleTheme();
    if (excalidrawAPI) {
      excalidrawAPI.updateScene({
        appState: {
          theme: newTheme,
          viewBackgroundColor: newTheme === "dark" ? "#1e1e1e" : "#ffffff",
        },
      });
    }
  };

  // Export to local Excalidraw JSON file
  const handleExportToJSON = useCallback(() => {
    if (!canvasData) return;
    const exportData = {
      type: "excalidraw",
      version: 2,
      source: "https://drawx.tauri.app",
      elements: elements,
      appState: appState,
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${canvasData.title || "untitled"}.excalidraw`;
    link.click();
    URL.revokeObjectURL(url);
  }, [canvasData, elements, appState]);

  // Import from local Excalidraw JSON file
  const handleImportFromJSON = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.excalidraw";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (imported && Array.isArray(imported.elements)) {
            if (excalidrawAPI) {
              const importedAppState = getPersistentAppState(imported.appState || {});
              excalidrawAPI.updateScene({
                elements: imported.elements,
                appState: {
                  ...importedAppState,
                  viewBackgroundColor:
                    importedAppState.viewBackgroundColor ||
                    (theme === "dark" ? "#1e1e1e" : "#ffffff"),
                },
              });

              setElements(imported.elements);
              setAppState(importedAppState);
              setSaveStatus("unsaved");
            }
          } else {
            alert("Invalid Excalidraw file structure.");
          }
        } catch (err) {
          console.error("Failed to parse imported file:", err);
          alert("Failed to parse the imported file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [excalidrawAPI, theme]);

  // Export to PNG
  const handleExportToPNG = useCallback(async () => {
    if (!excalidrawAPI || !canvasData) return;
    try {
      const currentElements = excalidrawAPI.getSceneElements();
      const currentAppState = excalidrawAPI.getAppState();
      const blob = await exportToBlob({
        elements: currentElements,
        appState: currentAppState,
        mimeType: "image/png",
        exportPadding: 15,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${canvasData.title || "drawing"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export PNG:", error);
    }
  }, [excalidrawAPI, canvasData]);

  // Export to SVG
  const handleExportToSVG = useCallback(async () => {
    if (!excalidrawAPI || !canvasData) return;
    try {
      const currentElements = excalidrawAPI.getSceneElements();
      const currentAppState = excalidrawAPI.getAppState();
      const svg = await exportToSvg({
        elements: currentElements,
        appState: currentAppState,
        exportPadding: 15,
        viewBackgroundColor:
          currentAppState.viewBackgroundColor || (theme === "dark" ? "#1e1e1e" : "#ffffff"),
      });
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${canvasData.title || "drawing"}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export SVG:", error);
    }
  }, [excalidrawAPI, canvasData, theme]);

  if (loading) {
    return (
      <div
        className="flex h-screen font-sans"
        style={{ background: "var(--color-surface-low)", color: "var(--color-text-primary)" }}
      >
        <Sidebar />
        <main
          className="flex-1 flex items-center justify-center"
          style={{ background: "var(--color-surface-mid)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <span
              className="loading loading-spinner loading-md"
              style={{ color: "var(--color-text-muted)" }}
            ></span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Loading...
            </span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen font-sans overflow-hidden"
      style={{ background: "var(--color-surface-low)", color: "var(--color-text-primary)" }}
    >
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div
          className="flex items-center justify-between px-3 py-1.5 z-20 shrink-0"
          style={{
            borderBottom: "1px solid var(--color-border-subtle)",
            background: "var(--color-surface-mid)",
          }}
        >
          <div className="flex items-center gap-2 max-w-[60%]">
            <Link
              to="/"
              className="p-1 rounded"
              style={{ color: "var(--color-text-muted)" }}
              title="Back to workspace"
            >
              <Icon icon="lucide:arrow-left" className="w-4 h-4" />
            </Link>

            <div
              className="w-px h-4 shrink-0"
              style={{ background: "var(--color-border-subtle)" }}
            />

            {isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleTitleSave}
                className="px-1.5 py-0.5 text-sm font-medium rounded border outline-none"
                style={{
                  background: "var(--input-bg)",
                  borderColor: "var(--input-border-focus)",
                  color: "var(--input-text)",
                }}
                autoFocus
              />
            ) : (
              <button
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-sm font-medium truncate group"
                style={{ color: "var(--color-text-primary)" }}
                title="Click to rename"
              >
                <span className="truncate">{canvasData?.title || "Untitled"}</span>
                <Icon
                  icon="lucide:pencil"
                  className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  style={{ color: "var(--color-text-disabled)" }}
                />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-xs mr-1 hidden sm:inline"
              style={{ color: "var(--color-text-disabled)" }}
            >
              {saveStatus === "saving" && "Saving..."}
              {saveStatus === "saved" && "Saved"}
              {saveStatus === "unsaved" && "Unsaved"}
            </span>

            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className="p-1.5 rounded disabled:opacity-30"
              style={{ color: "var(--color-text-muted)" }}
              title="Save"
            >
              {saveStatus === "saving" ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <Icon icon="lucide:save" className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={handleToggleTheme}
              className="p-1.5 rounded"
              style={{ color: "var(--color-text-muted)" }}
              title={theme === "light" ? "Dark mode" : "Light mode"}
            >
              <Icon icon={theme === "light" ? "lucide:moon" : "lucide:sun"} className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Excalidraw Board */}
        <div className="flex-1 w-full h-full min-h-0 relative z-10">
          <Excalidraw
            theme={theme}
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            initialData={{
              elements: elements,
              appState: {
                ...appState,
                // Make background adapt to theme if not already set
                viewBackgroundColor:
                  appState.viewBackgroundColor || (theme === "dark" ? "#1e1e1e" : "#ffffff"),
              },
            }}
            onChange={handleExcalidrawChange}
          >
            <MainMenu>
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.Item
                onSelect={handleExportToJSON}
                icon={<Icon icon="lucide:download" className="w-4 h-4" />}
              >
                Export File (.excalidraw)
              </MainMenu.Item>
              <MainMenu.Item
                onSelect={handleImportFromJSON}
                icon={<Icon icon="lucide:upload" className="w-4 h-4" />}
              >
                Import File (.excalidraw)
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.Item
                onSelect={handleExportToPNG}
                icon={<Icon icon="lucide:image" className="w-4 h-4" />}
              >
                Export as PNG
              </MainMenu.Item>
              <MainMenu.Item
                onSelect={handleExportToSVG}
                icon={<Icon icon="lucide:file-code" className="w-4 h-4" />}
              >
                Export as SVG
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Logo>
                  <Icon icon="lucide:pen-tool" className="w-8 h-8 text-primary mx-auto mb-1" />
                </WelcomeScreen.Center.Logo>
                <WelcomeScreen.Center.Heading>Drawx</WelcomeScreen.Center.Heading>
                <WelcomeScreen.Center.MenuItemHelp />
                <div
                  className="text-xs max-w-xs mx-auto mt-2"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Sketch, add shapes, or use templates. Changes save automatically.
                </div>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>

          {isChangingCanvas && (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center"
              style={{ background: "var(--color-surface-low)", opacity: 0.8 }}
            >
              <span
                className="loading loading-spinner loading-md"
                style={{ color: "var(--color-text-muted)" }}
              ></span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
