import { Icon } from "@iconify/react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { type Canvas, createCanvas, deleteCanvas, listCanvases } from "../services/wails.ts";
import { DatabaseSettings } from "./database-settings.tsx";
import { LibraryBrowser } from "./library-browser.tsx";

function groupCanvasesByDate(canvases: Canvas[]): {
  Today: Canvas[];
  Older: Canvas[];
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const grouped: { Today: Canvas[]; Older: Canvas[] } = {
    Today: [],
    Older: [],
  };

  canvases.forEach((canvas) => {
    const canvasDate = new Date(canvas.updatedAt);
    if (canvasDate >= today) {
      grouped.Today.push(canvas);
    } else {
      grouped.Older.push(canvas);
    }
  });

  return grouped;
}

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLibraries, setShowLibraries] = useState(false);
  const { id: currentCanvasId } = useParams();
  const navigate = useNavigate();

  const loadCanvases = useCallback(async () => {
    try {
      const result = await listCanvases();
      setCanvases(result);
    } catch (error) {
      console.error("Failed to load canvases:", error);
    }
  }, []);

  useEffect(() => {
    loadCanvases();
    globalThis.addEventListener("canvas-updated", loadCanvases);
    return () => globalThis.removeEventListener("canvas-updated", loadCanvases);
  }, [loadCanvases]);

  async function handleCreateCanvas() {
    setIsCreating(true);
    try {
      const now = new Date();
      const title = now.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const newCanvas = await createCanvas(title);
      globalThis.dispatchEvent(new Event("canvas-updated"));
      navigate(`/canvas/${newCanvas.id}`);
    } catch (error) {
      console.error("Failed to create canvas:", error);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteCanvas(canvasId: string, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    setDeletingId(canvasId);
    try {
      await deleteCanvas(canvasId);
      globalThis.dispatchEvent(new Event("canvas-updated"));
      if (canvasId === currentCanvasId) {
        navigate("/");
      }
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    } finally {
      setDeletingId(null);
    }
  }

  const grouped = groupCanvasesByDate(canvases);

  return (
    <>
      <aside
        className="flex flex-col h-full transition-all duration-200 relative z-30 shrink-0 select-none overflow-hidden"
        style={{
          width: sidebarOpen ? "240px" : "0",
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
          color: "var(--color-text-primary)",
        }}
      >
        <div
          className="p-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            <Icon
              icon="lucide:pen-tool"
              className="w-4 h-4"
              style={{ color: "var(--color-primary)" }}
            />
            <span>Drawx</span>
          </Link>
          <button
            type="button"
            onClick={handleCreateCanvas}
            disabled={isCreating}
            className="p-1 rounded"
            style={{ color: "var(--color-text-muted)" }}
            title="New canvas"
            aria-label="New canvas"
          >
            {isCreating ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <Icon icon="lucide:plus" className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {grouped.Today.length > 0 && (
            <div className="mb-2">
              <h3
                className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-disabled)" }}
              >
                Today
              </h3>
              <ul>
                {grouped.Today.map((canvas) => (
                  <li key={canvas.id}>
                    <Link
                      to={`/canvas/${canvas.id}`}
                      className="group flex items-center justify-between px-4 py-1.5 text-sm"
                      style={{
                        background:
                          canvas.id === currentCanvasId
                            ? "var(--sidebar-item-active)"
                            : "transparent",
                        color:
                          canvas.id === currentCanvasId
                            ? "var(--color-text-primary)"
                            : "var(--color-text-secondary)",
                        fontWeight: canvas.id === currentCanvasId ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (canvas.id !== currentCanvasId) {
                          e.currentTarget.style.background = "var(--sidebar-item-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (canvas.id !== currentCanvasId) {
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      <span className="truncate">{canvas.title}</span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                        disabled={deletingId === canvas.id}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                        style={{ color: "var(--color-danger)" }}
                        title="Delete"
                        aria-label="Delete canvas"
                      >
                        {deletingId === canvas.id ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          <Icon icon="lucide:trash-2" className="w-3 h-3" />
                        )}
                      </button>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {grouped.Older.length > 0 && (
            <div className="mb-2">
              <h3
                className="px-4 py-1 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-disabled)" }}
              >
                Older
              </h3>
              <ul>
                {grouped.Older.map((canvas) => (
                  <li key={canvas.id}>
                    <Link
                      to={`/canvas/${canvas.id}`}
                      className="group flex items-center justify-between px-4 py-1.5 text-sm"
                      style={{
                        background:
                          canvas.id === currentCanvasId
                            ? "var(--sidebar-item-active)"
                            : "transparent",
                        color:
                          canvas.id === currentCanvasId
                            ? "var(--color-text-primary)"
                            : "var(--color-text-secondary)",
                        fontWeight: canvas.id === currentCanvasId ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (canvas.id !== currentCanvasId) {
                          e.currentTarget.style.background = "var(--sidebar-item-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (canvas.id !== currentCanvasId) {
                          e.currentTarget.style.background = "transparent";
                        }
                      }}
                    >
                      <span className="truncate">{canvas.title}</span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                        disabled={deletingId === canvas.id}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                        style={{ color: "var(--color-danger)" }}
                        title="Delete"
                        aria-label="Delete canvas"
                      >
                        {deletingId === canvas.id ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          <Icon icon="lucide:trash-2" className="w-3 h-3" />
                        )}
                      </button>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canvases.length === 0 && (
            <div
              className="text-center py-10 px-4 text-xs"
              style={{ color: "var(--color-text-disabled)" }}
            >
              <p className="mb-2">No drawings yet</p>
              <button
                type="button"
                onClick={handleCreateCanvas}
                className="hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                Create one
              </button>
            </div>
          )}
        </div>

        <div className="p-2" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          <div className="flex gap-1 mb-1">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex-1 p-1 rounded"
              style={{ color: "var(--color-text-disabled)" }}
              title="Database Settings"
              aria-label="Database Settings"
            >
              <Icon icon="lucide:database" className="w-4 h-4 mx-auto" />
            </button>
            <button
              type="button"
              onClick={() => setShowLibraries(true)}
              className="flex-1 p-1 rounded"
              style={{ color: "var(--color-text-disabled)" }}
              title="Libraries"
              aria-label="Libraries"
            >
              <Icon icon="lucide:library" className="w-4 h-4 mx-auto" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="w-full p-1 rounded"
            style={{ color: "var(--color-text-disabled)" }}
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <Icon icon="lucide:panel-left-close" className="w-4 h-4 mx-auto" />
          </button>
        </div>
      </aside>

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 p-1.5 rounded-r shadow-sm"
          style={{
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--sidebar-border)",
            borderTop: "1px solid var(--sidebar-border)",
            borderBottom: "1px solid var(--sidebar-border)",
            color: "var(--color-text-muted)",
          }}
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <Icon icon="lucide:panel-left-open" className="w-4 h-4" />
        </button>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg p-4">
            <DatabaseSettings onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {showLibraries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg p-4 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Libraries</h2>
              <button
                type="button"
                onClick={() => setShowLibraries(false)}
                className="p-1 rounded hover:bg-accent"
              >
                <Icon icon="lucide:x" className="w-5 h-5" />
              </button>
            </div>
            <LibraryBrowser />
          </div>
        </div>
      )}
    </>
  );
}
