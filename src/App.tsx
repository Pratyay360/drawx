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
import { useTheme } from "./theme-context.tsx";
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
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    loadDrawings();
    window.addEventListener("canvas-updated", loadDrawings);
    return () => window.removeEventListener("canvas-updated", loadDrawings);
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
    if (!confirm("Delete this drawing?")) return;

    try {
      await deleteCanvas(id);
      window.dispatchEvent(new Event("canvas-updated"));
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    }
  }

  function startEditing(id: string, currentTitle: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  }

  function handleRename(id: string, e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editTitle.trim()) return;

    try {
      updateCanvasTitle(id, editTitle.trim());
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
    <div
      className="flex h-screen font-sans"
      style={{ background: "var(--color-surface-low)", color: "var(--color-text-primary)" }}
    >
      <Sidebar />
      <main className="flex-1 overflow-auto px-6 py-8 lg:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Drawx
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Your drawings and sketches
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setViewMode("grid")}
                className="p-1.5 rounded"
                style={{
                  background: viewMode === "grid" ? "var(--color-active)" : "transparent",
                  color:
                    viewMode === "grid" ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
                title="Grid view"
              >
                <Icon icon="lucide:grid" className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className="p-1.5 rounded"
                style={{
                  background: viewMode === "list" ? "var(--color-active)" : "transparent",
                  color:
                    viewMode === "list" ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
                title="List view"
              >
                <Icon icon="lucide:list" className="w-4 h-4" />
              </button>
              <div className="w-px h-4 mx-1" style={{ background: "var(--color-border-subtle)" }} />
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded"
                style={{ color: "var(--color-text-muted)" }}
                title={theme === "light" ? "Dark mode" : "Light mode"}
              >
                <Icon icon={theme === "light" ? "lucide:moon" : "lucide:sun"} className="w-4 h-4" />
              </button>
            </div>
          </header>

          <form onSubmit={handleCreateCanvas} className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New drawing name..."
              className="flex-1 max-w-sm px-3 py-1.5 text-sm rounded-lg border outline-none"
              style={{
                background: "var(--input-bg)",
                borderColor: "var(--input-border)",
                color: "var(--input-text)",
              }}
              disabled={loading}
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm font-medium rounded-lg"
              style={{
                background: "var(--color-primary)",
                color: "#fff",
              }}
              disabled={loading || !name.trim()}
            >
              {loading ? <span className="loading loading-spinner loading-xs"></span> : "Create"}
            </button>
          </form>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Icon
                icon="lucide:search"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "var(--color-text-muted)" }}
              />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border outline-none"
                style={{
                  background: "var(--input-bg)",
                  borderColor: "var(--input-border)",
                  color: "var(--input-text)",
                }}
              />
            </div>
          </div>

          {filteredCanvases.length > 0 ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCanvases.map((canvas) => (
                  <div
                    key={canvas.id}
                    onClick={() => navigate(`/canvas/${canvas.id}`)}
                    className="rounded-lg p-4 cursor-pointer transition-colors group"
                    style={{
                      border: "1px solid var(--color-border-subtle)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {canvas.title}
                      </h3>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                        <button
                          onClick={(e) => startEditing(canvas.id, canvas.title, e)}
                          className="p-1 rounded"
                          style={{ color: "var(--color-text-muted)" }}
                          title="Rename"
                        >
                          <Icon icon="lucide:pencil" className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                          className="p-1 rounded"
                          style={{ color: "var(--color-danger)" }}
                          title="Delete"
                        >
                          <Icon icon="lucide:trash-2" className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {editingId === canvas.id ? (
                      <div
                        className="flex items-center gap-1 mt-1"
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
                          className="flex-1 px-2 py-0.5 text-xs rounded border outline-none"
                          style={{
                            background: "var(--input-bg)",
                            borderColor: "var(--input-border-focus)",
                            color: "var(--input-text)",
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => handleRename(canvas.id)}
                          className="p-0.5"
                          style={{ color: "var(--color-success-text)" }}
                        >
                          <Icon icon="lucide:check" className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-0.5"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          <Icon icon="lucide:x" className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {new Date(canvas.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--color-border-subtle)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "var(--color-text-muted)" }} className="text-xs">
                      <th className="text-left font-medium px-4 py-2">Title</th>
                      <th className="text-left font-medium px-4 py-2">Updated</th>
                      <th className="text-right font-medium px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCanvases.map((canvas) => (
                      <tr
                        key={canvas.id}
                        onClick={() => navigate(`/canvas/${canvas.id}`)}
                        className="cursor-pointer group"
                        style={{ borderTop: "1px solid var(--color-border-subtle)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--color-hover)")
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td className="px-4 py-2">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--color-text-primary)" }}
                          >
                            {canvas.title}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2 text-xs"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {new Date(canvas.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={(e) => startEditing(canvas.id, canvas.title, e)}
                              className="p-1 rounded"
                              style={{ color: "var(--color-text-muted)" }}
                              title="Rename"
                            >
                              <Icon icon="lucide:pencil" className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                              className="p-1 rounded"
                              style={{ color: "var(--color-danger)" }}
                              title="Delete"
                            >
                              <Icon icon="lucide:trash-2" className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="text-center py-16" style={{ color: "var(--color-text-muted)" }}>
              <Icon icon="lucide:file-text" className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : "No drawings yet. Create one above."}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-xs mt-2 hover:underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  Clear search
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
