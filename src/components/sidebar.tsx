import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Canvas,
  listCanvases,
  createCanvas,
  deleteCanvas,
} from "../services/tauri.ts";

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
  const { id: currentCanvasId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    loadCanvases();

    // Listen for canvas updates to sync across components
    window.addEventListener("canvas-updated", loadCanvases);
    return () => {
      window.removeEventListener("canvas-updated", loadCanvases);
    };
  }, []);

  async function loadCanvases() {
    try {
      const result = await listCanvases();
      setCanvases(result);
    } catch (error) {
      console.error("Failed to load canvases:", error);
    }
  }

  async function handleCreateCanvas() {
    setIsCreating(true);
    try {
      const newCanvas = await createCanvas("Untitled Canvas");
      window.dispatchEvent(new Event("canvas-updated"));
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
      window.dispatchEvent(new Event("canvas-updated"));

      // If we deleted the canvas we are currently viewing, navigate to dashboard
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
        className="flex flex-col h-full bg-base-300 border-r border-base-content/10 transition-all duration-300 relative z-30 shrink-0 text-base-content select-none overflow-hidden"
        style={{ width: sidebarOpen ? "256px" : "0" }}
      >
        <div className="p-4 flex items-center justify-between border-b border-base-content/10 bg-base-300/40">
          <Link
            to="/"
            className="flex items-center gap-2 font-black tracking-tight text-lg text-primary hover:opacity-90"
          >
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-content shadow-md shadow-primary/20">
              <Icon icon="lucide:palette" className="h-4 w-4" />
            </div>
            <span>Drawx</span>
          </Link>
          <button
            onClick={handleCreateCanvas}
            disabled={isCreating}
            className="btn btn-ghost btn-sm btn-square hover:bg-base-200/50 rounded-lg text-base-content/80 hover:text-base-content"
            title="Create new canvas"
            aria-label="New canvas"
          >
            {isCreating ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <Icon icon="lucide:square-pen" className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {grouped.Today.length > 0 && (
            <div>
              <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-base-content/40 mb-1.5">
                Today
              </h3>
              <ul className="space-y-0.5">
                {grouped.Today.map((canvas) => (
                  <li key={canvas.id}>
                    <Link
                      to={`/canvas/${canvas.id}`}
                      className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-base-200/60 ${
                        canvas.id === currentCanvasId
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-base-content/75 hover:text-base-content"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon
                          icon="lucide:file-text"
                          className="w-4 h-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                        <span className="truncate">{canvas.title}</span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                        disabled={deletingId === canvas.id}
                        className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-square hover:bg-error/15 hover:text-error rounded-lg transition-all"
                        title="Delete canvas"
                        aria-label="Delete canvas"
                      >
                        {deletingId === canvas.id ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          <Icon icon="lucide:trash-2" className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {grouped.Older.length > 0 && (
            <div>
              <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-base-content/40 mb-1.5">
                Older
              </h3>
              <ul className="space-y-0.5">
                {grouped.Older.map((canvas) => (
                  <li key={canvas.id}>
                    <Link
                      to={`/canvas/${canvas.id}`}
                      className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all hover:bg-base-200/60 ${
                        canvas.id === currentCanvasId
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-base-content/75 hover:text-base-content"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon
                          icon="lucide:file-text"
                          className="w-4 h-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        />
                        <span className="truncate">{canvas.title}</span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                        disabled={deletingId === canvas.id}
                        className="opacity-0 group-hover:opacity-100 btn btn-ghost btn-xs btn-square hover:bg-error/15 hover:text-error rounded-lg transition-all"
                        title="Delete canvas"
                        aria-label="Delete canvas"
                      >
                        {deletingId === canvas.id ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          <Icon icon="lucide:trash-2" className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canvases.length === 0 && (
            <div className="text-center py-8 px-4 text-xs text-base-content/50 space-y-2">
              <Icon
                icon="lucide:file-question"
                className="w-8 h-8 mx-auto opacity-40"
              />
              <p>No drawings saved yet.</p>
              <button
                onClick={handleCreateCanvas}
                className="btn btn-xs btn-primary rounded-lg"
              >
                Create One
              </button>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-base-content/10">
          <button
            onClick={() => setSidebarOpen(false)}
            className="btn btn-ghost btn-xs btn-square hover:bg-base-200/50 rounded-lg text-base-content/60 w-full"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <Icon icon="lucide:chevron-left" className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 btn btn-ghost btn-sm btn-square rounded-r-xl rounded-l-none bg-base-300 border-r border-t border-b border-base-content/10 shadow-md hover:bg-base-200 text-base-content/60 hover:text-base-content"
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <Icon icon="lucide:chevron-right" className="w-4 h-4" />
        </button>
      )}
    </>
  );
}
