import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { Sidebar } from "./components/sidebar.tsx";
import { Canvas as CanvasComponent } from "./canvas/main.tsx";
import {
  Canvas,
  listCanvases,
  createCanvas,
  deleteCanvas,
  updateCanvasTitle,
} from "./services/tauri.ts";
import "./App.css";

function Dashboard() {
  const [name, setName] = useState("");
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadDrawings();

    // Sync when canvas changes occur in sidebar or other parts
    window.addEventListener("canvas-updated", loadDrawings);
    return () => {
      window.removeEventListener("canvas-updated", loadDrawings);
    };
  }, []);

  async function loadDrawings() {
    try {
      const result = await listCanvases();
      setCanvases(result);
    } catch (error) {
      console.error("Failed to load drawings:", error);
    }
  }

  async function handleCreateCanvas(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const newCanvas = await createCanvas(name.trim());
      setName("");
      window.dispatchEvent(new Event("canvas-updated"));
      navigate(`/canvas/${newCanvas.id}`);
    } catch (error) {
      console.error("Failed to create canvas:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCanvas(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this drawing?")) return;

    try {
      await deleteCanvas(id);
      window.dispatchEvent(new Event("canvas-updated"));
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    }
  }

  async function startEditing(
    id: string,
    currentTitle: string,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  }

  async function handleRename(id: string, e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editTitle.trim()) return;

    try {
      await updateCanvasTitle(id, editTitle.trim());
      setEditingId(null);
      window.dispatchEvent(new Event("canvas-updated"));
    } catch (error) {
      console.error("Failed to rename canvas:", error);
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
  }

  const filteredCanvases = canvases.filter((canvas) =>
    canvas.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-screen bg-base-100 text-base-content font-sans">
      <Sidebar />
      <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
        {/* Header Hero Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent text-left">
              Drawx Workspace
            </h1>
            <p className="text-sm text-base-content/60 mt-1">
              Brainstorm, draw, and organize your ideas visually.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`btn btn-sm btn-square rounded-lg ${
                viewMode === "grid" ? "btn-primary" : "btn-ghost"
              }`}
              title="Grid view"
            >
              <Icon icon="lucide:grid" className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`btn btn-sm btn-square rounded-lg ${
                viewMode === "list" ? "btn-primary" : "btn-ghost"
              }`}
              title="List view"
            >
              <Icon icon="lucide:list" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar & Create section */}
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleCreateCanvas} className="flex flex-1 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Start a new drawing..."
              className="input input-bordered flex-1 rounded-xl focus:border-primary focus:outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary rounded-xl"
              disabled={loading || !name.trim()}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <>
                  <Icon icon="lucide:plus" className="w-4 h-4 mr-1" />
                  Create
                </>
              )}
            </button>
          </form>

          <div className="relative w-full sm:w-64">
            <Icon
              icon="lucide:search"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-55"
            />
            <input
              type="text"
              placeholder="Search drawings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-bordered w-full pl-9 rounded-xl focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Canvas List/Grid */}
        {filteredCanvases.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCanvases.map((canvas) => (
                <div
                  key={canvas.id}
                  onClick={() => navigate(`/canvas/${canvas.id}`)}
                  className="card bg-base-200 border border-base-content/5 hover:border-primary/20 hover:bg-base-300/40 cursor-pointer transition-all duration-200 hover:-translate-y-1 group rounded-2xl shadow-sm hover:shadow-md"
                >
                  <div className="card-body p-6 flex flex-col justify-between min-h-40">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-content transition-all duration-200">
                          <Icon icon="lucide:palette" className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) =>
                              startEditing(canvas.id, canvas.title, e)
                            }
                            className="btn btn-ghost btn-xs btn-square hover:bg-base-100 rounded-lg text-base-content/70 hover:text-base-content"
                            title="Rename"
                          >
                            <Icon
                              icon="lucide:pencil"
                              className="w-3.5 h-3.5"
                            />
                          </button>
                          <button
                            onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                            className="btn btn-ghost btn-xs btn-square hover:bg-error/15 hover:text-error rounded-lg"
                            title="Delete"
                          >
                            <Icon
                              icon="lucide:trash-2"
                              className="w-3.5 h-3.5"
                            />
                          </button>
                        </div>
                      </div>

                      {editingId === canvas.id ? (
                        <div
                          className="flex items-center gap-1.5 mt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(canvas.id);
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="input input-sm input-bordered w-full rounded-lg"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRename(canvas.id)}
                            className="btn btn-success btn-xs btn-square rounded-lg"
                          >
                            <Icon icon="lucide:check" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="btn btn-ghost btn-xs btn-square hover:bg-base-100 rounded-lg"
                          >
                            <Icon icon="lucide:x" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <h2 className="card-title text-base font-bold text-left truncate group-hover:text-primary transition-colors">
                          {canvas.title}
                        </h2>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-base-content/50 mt-4 pt-3 border-t border-base-content/5">
                      <span className="flex items-center gap-1">
                        <Icon icon="lucide:clock" className="w-3.5 h-3.5" />
                        {new Date(canvas.updatedAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </span>
                      <span className="flex items-center gap-0.5 font-medium group-hover:text-primary transition-colors">
                        Open
                        <Icon
                          icon="lucide:arrow-right"
                          className="w-3 h-3 transition-transform group-hover:translate-x-1"
                        />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-base-200 rounded-2xl border border-base-content/5 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="border-b border-base-content/5 text-base-content/50">
                    <th className="font-bold py-4">Title</th>
                    <th className="font-bold py-4">Last Updated</th>
                    <th className="font-bold py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCanvases.map((canvas) => (
                    <tr
                      key={canvas.id}
                      onClick={() => navigate(`/canvas/${canvas.id}`)}
                      className="hover:bg-base-300/30 cursor-pointer border-b border-base-content/5 transition-colors group"
                    >
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <Icon
                            icon="lucide:palette"
                            className="w-4 h-4 text-primary shrink-0"
                          />
                          {editingId === canvas.id ? (
                            <div
                              className="flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleRename(canvas.id);
                                  if (e.key === "Escape") handleCancelEdit();
                                }}
                                className="input input-xs input-bordered rounded-lg w-48"
                                autoFocus
                              />
                              <button
                                onClick={() => handleRename(canvas.id)}
                                className="btn btn-success btn-xs btn-square rounded-lg"
                              >
                                <Icon
                                  icon="lucide:check"
                                  className="w-3.5 h-3.5"
                                />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="btn btn-ghost btn-xs btn-square hover:bg-base-200 rounded-lg"
                              >
                                <Icon icon="lucide:x" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-bold truncate max-w-xs group-hover:text-primary transition-colors">
                              {canvas.title}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-sm text-base-content/60 py-4">
                        {new Date(canvas.updatedAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </td>
                      <td
                        className="py-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) =>
                              startEditing(canvas.id, canvas.title, e)
                            }
                            className="btn btn-ghost btn-xs btn-square hover:bg-base-300 rounded-lg text-base-content/70 hover:text-base-content"
                            title="Rename"
                          >
                            <Icon
                              icon="lucide:pencil"
                              className="w-3.5 h-3.5"
                            />
                          </button>
                          <button
                            onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                            className="btn btn-ghost btn-xs btn-square hover:bg-error/15 hover:text-error rounded-lg"
                            title="Delete"
                          >
                            <Icon
                              icon="lucide:trash-2"
                              className="w-3.5 h-3.5"
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-20 px-4 bg-base-200/50 border border-dashed border-base-content/10 rounded-3xl mt-6 space-y-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-base-300 text-base-content/40">
              <Icon icon="lucide:palette" className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg">No drawings found</h3>
              <p className="text-sm text-base-content/50 max-w-sm">
                {searchQuery
                  ? `No drawings match your search query "${searchQuery}"`
                  : "Create a new drawing using the input above to get started brainstorm ideas."}
              </p>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="btn btn-sm btn-ghost rounded-lg"
              >
                Clear Search
              </button>
            )}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas/:id" element={<CanvasComponent />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
