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

// shadcn/ui Imports
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip.tsx";
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
      await loadDrawings();
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
      await loadDrawings();
    } catch (error) {
      console.error("Failed to delete canvas:", error);
    }
  }

  function startEditing(id: string, currentTitle: string, e: React.MouseEvent) {
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
      await loadDrawings();
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen bg-background text-foreground font-sans">
        <Sidebar />
        <main className="flex-1 overflow-auto px-6 py-8 lg:px-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            {/* Header */}
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Drawx</h1>
                <p className="text-sm mt-0.5 text-muted-foreground">Your drawings and sketches</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("grid")}
                    >
                      <Icon icon="lucide:grid" className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Grid view</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setViewMode("list")}
                    >
                      <Icon icon="lucide:list" className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>List view</TooltipContent>
                </Tooltip>

                <div className="w-px h-4 mx-1 bg-border" />
              </div>
            </header>

            {/* Create Form */}
            <form onSubmit={handleCreateCanvas} className="flex gap-2">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New drawing name..."
                className="max-w-sm"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? "Creating..." : "Create"}
              </Button>
            </form>

            {/* Search */}
            <div className="relative max-w-xs">
              <Icon
                icon="lucide:search"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Content */}
            {filteredCanvases.length > 0 ? (
              viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCanvases.map((canvas) => (
                    <Card
                      key={canvas.id}
                      onClick={() => navigate(`/canvas/${canvas.id}`)}
                      className="cursor-pointer group transition-colors hover:bg-accent"
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm font-medium truncate">
                            {canvas.title}
                          </CardTitle>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => startEditing(canvas.id, canvas.title, e)}
                            >
                              <Icon
                                icon="lucide:pencil"
                                className="h-3 w-3 text-muted-foreground"
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                            >
                              <Icon icon="lucide:trash-2" className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        {editingId === canvas.id ? (
                          <div
                            className="flex items-center gap-1 mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(canvas.id);
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              className="h-7 text-xs"
                              autoFocus
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => handleRename(canvas.id)}
                            >
                              <Icon
                                icon="lucide:check"
                                className="h-3 w-3 text-green-600 dark:text-green-400"
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={handleCancelEdit}
                            >
                              <Icon icon="lucide:x" className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {formatDate(canvas.updatedAt)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Title</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCanvases.map((canvas) => (
                        <TableRow
                          key={canvas.id}
                          onClick={() => navigate(`/canvas/${canvas.id}`)}
                          className="cursor-pointer group"
                        >
                          <TableCell>
                            {editingId === canvas.id ? (
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRename(canvas.id);
                                    if (e.key === "Escape") handleCancelEdit();
                                  }}
                                  className="h-7 text-xs"
                                  autoFocus
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  onClick={() => handleRename(canvas.id)}
                                >
                                  <Icon
                                    icon="lucide:check"
                                    className="h-3 w-3 text-green-600 dark:text-green-400"
                                  />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  onClick={handleCancelEdit}
                                >
                                  <Icon icon="lucide:x" className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm font-medium">{canvas.title}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(canvas.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => startEditing(canvas.id, canvas.title, e)}
                              >
                                <Icon
                                  icon="lucide:pencil"
                                  className="h-3 w-3 text-muted-foreground"
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleDeleteCanvas(canvas.id, e)}
                              >
                                <Icon icon="lucide:trash-2" className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Icon icon="lucide:file-text" className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchQuery
                    ? `No results for "${searchQuery}"`
                    : "No drawings yet. Create one above."}
                </p>
                {searchQuery && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="mt-2"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

// ==========================================
// App Component
// ==========================================
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
