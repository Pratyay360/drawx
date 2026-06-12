import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import { Icon } from "@iconify/react";
import "@excalidraw/excalidraw/index.css";
import { Sidebar } from "../components/sidebar.tsx";
import {
  Canvas as CanvasData,
  loadCanvas,
  sanitizeExcalidrawAppState,
  saveCanvas,
  updateCanvasTitle,
} from "../services/tauri.ts";

export function Canvas() {
  const { id } = useParams<{ id: string }>();
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [elements, setElements] = useState<any[]>([]);
  const [appState, setAppState] = useState<any>({});

  // Save status: "saved" | "unsaved" | "saving"
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">(
    "saved",
  );

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("drawx_theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const isInitialLoaded = useRef(false);
  const isSavingRef = useRef(false);

  // Sync theme to document element
  useEffect(() => {
    localStorage.setItem("drawx_theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Load canvas data on mount/id change
  useEffect(() => {
    isInitialLoaded.current = false;
    setSaveStatus("saved");
    fetchCanvas();
  }, [id]);

  async function fetchCanvas() {
    if (!id) return;

    setLoading(true);
    try {
      const data = await loadCanvas(id);
      if (data) {
        const sanitizedAppState = sanitizeExcalidrawAppState(data.appState);
        setCanvasData({ ...data, appState: sanitizedAppState });
        setElements(data.elements || []);
        setAppState(sanitizedAppState);
        setTitleInput(data.title);
      }
    } catch (error) {
      console.error("Failed to load canvas:", error);
    } finally {
      setLoading(false);
    }
  }

  // Debounced auto-save effect
  useEffect(() => {
    if (loading || !id) return;

    // Skip the very first run after loadCanvas finishes
    if (!isInitialLoaded.current) {
      isInitialLoaded.current = true;
      return;
    }

    setSaveStatus("unsaved");

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
  }, [elements, appState, id, loading]);

  // Handle manual save
  const handleManualSave = useCallback(async () => {
    if (!id || isSavingRef.current) return;

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
  }, [id, elements, appState]);

  // Handle Excalidraw changes
  const handleExcalidrawChange = useCallback(
    (
      excalidrawElements: readonly any[],
      excalidrawAppState: any,
      _files: any,
    ) => {
      // Avoid triggering changes if we are still loading
      if (!isInitialLoaded.current) return;

      // Excalidraw updates state frequently, we only save the core elements and layout-related appState
      setElements([...excalidrawElements]);
      setAppState(sanitizeExcalidrawAppState(excalidrawAppState));
    },
    [],
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

  // Toggle theme helper
  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-base-100 text-base-content font-sans">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-base-100 text-base-content font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-base-content/10 bg-base-200 z-20 shadow-sm shrink-0">
          <div className="flex items-center gap-3 max-w-[60%]">
            <Link
              to="/"
              className="btn btn-ghost btn-sm rounded-lg hover:bg-base-300 gap-1.5 shrink-0"
              title="Go to Dashboard"
            >
              <Icon icon="lucide:arrow-left" className="w-4 h-4" />
              <span>Workspace</span>
            </Link>

            <div className="h-4 w-px bg-base-content/10 shrink-0" />

            {/* Editable title */}
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleTitleSave}
                  className="input input-sm input-bordered rounded-lg w-48 font-bold focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-2 cursor-pointer group hover:bg-base-300/60 px-2 py-1 rounded-lg transition-colors truncate"
                title="Click to rename"
              >
                <h2 className="text-sm font-bold text-base-content truncate">
                  {canvasData?.title || "Untitled Canvas"}
                </h2>
                <Icon
                  icon="lucide:pencil"
                  className="w-3.5 h-3.5 text-base-content/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Save Status Badge */}
            <div className="mr-2 hidden sm:block">
              {saveStatus === "saving" && (
                <div className="flex items-center gap-1.5 text-xs text-info font-medium bg-info/10 px-2.5 py-1 rounded-full">
                  <span className="loading loading-spinner loading-xs scale-75"></span>
                  <span>Saving...</span>
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center gap-1 text-xs text-success font-medium bg-success/10 px-2.5 py-1 rounded-full">
                  <Icon icon="lucide:cloud-lightning" className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </div>
              )}
              {saveStatus === "unsaved" && (
                <div className="flex items-center gap-1 text-xs text-warning font-medium bg-warning/10 px-2.5 py-1 rounded-full">
                  <Icon
                    icon="lucide:cloud-off"
                    className="w-3.5 h-3.5 animate-pulse"
                  />
                  <span>Unsaved changes</span>
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving"}
              className={`btn btn-sm rounded-lg ${saveStatus === "unsaved" ? "btn-warning" : "btn-outline"} px-3`}
              title="Force Save to Backend"
            >
              {saveStatus === "saving" ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <>
                  <Icon icon="lucide:save" className="w-4 h-4" />
                  <span className="hidden xs:inline">Save</span>
                </>
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="btn btn-sm btn-ghost btn-square rounded-lg hover:bg-base-300 text-base-content/75 hover:text-base-content"
              title={
                theme === "light"
                  ? "Switch to Dark Mode"
                  : "Switch to Light Mode"
              }
            >
              <Icon
                icon={theme === "light" ? "lucide:moon" : "lucide:sun"}
                className="w-4 h-4"
              />
            </button>
          </div>
        </div>

        {/* Excalidraw Board */}
        <div className="flex-1 w-full h-full min-h-0 relative z-10">
          <Excalidraw
            theme={theme}
            initialData={{
              elements: canvasData?.elements || [],
              appState: {
                ...appState,
                // Make background adapt to theme if not already set
                viewBackgroundColor:
                  appState.viewBackgroundColor ||
                  (theme === "dark" ? "#1e1e1e" : "#ffffff"),
              },
            }}
            onChange={handleExcalidrawChange}
          />
        </div>
      </main>
    </div>
  );
}
