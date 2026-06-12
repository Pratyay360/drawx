import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "@iconify/react";
import { Sidebar } from "../components/sidebar";

interface CanvasData {
  id: string;
  title: string;
  elements: any[];
  appState: any;
}

export function Canvas() {
  const { id } = useParams<{ id: string }>();
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [elements, setElements] = useState<any[]>([]);
  const [appState, setAppState] = useState<any>({});

  useEffect(() => {
    loadCanvas();
  }, [id]);

  async function loadCanvas() {
    if (!id) return;

    setLoading(true);
    try {
      const data = await invoke<CanvasData>("load_canvas", { id });
      setCanvasData(data);
      setElements(data.elements || []);
      setAppState(data.appState || {});
    } catch (error) {
      console.error("Failed to load canvas:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = useCallback(async () => {
    if (!id) return;

    setSaving(true);
    try {
      await invoke("save_canvas", {
        id,
        elements,
        appState,
      });
    } catch (error) {
      console.error("Failed to save canvas:", error);
    } finally {
      setSaving(false);
    }
  }, [id, elements, appState]);

  const handleExcalidrawChange = useCallback(
    (excalidrawElements: readonly any[], excalidrawAppState: any, _files: any) => {
      setElements([...excalidrawElements]);
      setAppState(excalidrawAppState);
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <span className="loading loading-spinner loading-lg"></span>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-2 border-b border-base-content/10 bg-base-200">
          <div className="flex items-center gap-2">
            <Link to="/" className="btn btn-ghost btn-sm">
              <Icon icon="lucide:arrow-left" className="w-4 h-4" />
              Back
            </Link>
            <h2 className="text-sm font-medium text-base-content/70">
              {canvasData?.title || "Untitled Canvas"}
            </h2>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <>
                <Icon icon="lucide:save" className="w-4 h-4" />
                Save
              </>
            )}
          </button>
        </div>
        <div className="flex-1">
          <Excalidraw
            initialData={{
              elements: canvasData?.elements || [],
              appState: {
                ...canvasData?.appState,
                viewBackgroundColor: "#ffffff",
              },
            }}
            onChange={handleExcalidrawChange}
          />
        </div>
      </main>
    </div>
  );
}
