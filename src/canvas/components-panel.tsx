import {
  CaptureUpdateAction,
  type ExcalidrawAPI,
  type ExcalidrawElement,
  exportToSvg,
  getCommonBounds,
} from "@excalidraw/excalidraw";
import { Icon } from "@iconify/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { type LibraryWithItems, loadLibrariesWithItems } from "../services/libraries";

// ── insertion ─────────────────────────────────────────────────────────────

/**
 * Inserts a library component (an array of elements) at the center of the
 * current viewport, honoring pan and zoom. Any files referenced by the item
 * (e.g. embedded images) are registered first.
 */
function insertLibraryItem(
  api: ExcalidrawAPI,
  item: readonly ExcalidrawElement[],
  files?: any,
): void {
  if (item.length === 0) return;

  const fileList = files && typeof files === "object" ? Object.values(files) : [];
  if (fileList.length > 0) api.addFiles(fileList);

  const appState = api.getAppState();
  const zoom = appState.zoom?.value || 1;
  const [minX, minY, maxX, maxY] = getCommonBounds(item);
  const itemCenterX = (minX + maxX) / 2;
  const itemCenterY = (minY + maxY) / 2;
  // Viewport center in scene coordinates: viewportCoordsToSceneCoords is
  // x / zoom + scrollX (screen = (scene - scroll) * zoom).
  const viewCenterX = appState.width / 2 / zoom + appState.scrollX;
  const viewCenterY = appState.height / 2 / zoom + appState.scrollY;

  const positioned = item.map((el) => ({
    ...el,
    x: el.x + (viewCenterX - itemCenterX),
    y: el.y + (viewCenterY - itemCenterY),
  }));

  // Keep any deleted elements so undo history stays intact; mark the insert
  // as immediately undoable so it behaves like a normal user action.
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...positioned],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

// ── thumbnails ────────────────────────────────────────────────────────────

function ItemThumb({
  item,
  files,
  label,
  onClick,
  disabled,
}: {
  item: readonly ExcalidrawElement[];
  files?: any;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  // Render the SVG preview lazily, only when the thumbnail scrolls into view.
  // Libraries can contain dozens of items; rendering all of them eagerly would
  // spawn a burst of exportToSvg calls on panel open.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    exportToSvg({
      elements: item,
      appState: { exportBackground: false } as any,
      files,
      exportPadding: 6,
    })
      .then((svg) => {
        if (cancelled) return;
        const markup = new XMLSerializer().serializeToString(svg);
        objectUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
        setUrl(objectUrl);
      })
      .catch((error) => {
        console.error("Failed to render component preview:", error);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [item, files, visible]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={`Insert ${label}`}
      className="group aspect-square flex items-center justify-center overflow-hidden rounded border border-border/60 bg-card p-1 transition-colors hover:border-ring hover:bg-accent/60 disabled:opacity-60"
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="max-h-full max-w-full transition-transform duration-150 group-hover:scale-105"
        />
      ) : (
        <Icon icon="lucide:loader-2" className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </button>
  );
}

// ── panel ─────────────────────────────────────────────────────────────────

interface ComponentsPanelProps {
  excalidrawAPI: ExcalidrawAPI | null;
  onClose: () => void;
}

export function ComponentsPanel({ excalidrawAPI, onClose }: ComponentsPanelProps) {
  const [libraries, setLibraries] = useState<LibraryWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [insertingKey, setInsertingKey] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    loadLibrariesWithItems()
      .then((libs) => {
        if (!mounted) return;
        setLibraries(libs);
        // Expand the first library by default so the panel isn't empty-looking.
        if (libs.length > 0) {
          setExpanded({ [libs[0].library.id]: true });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filteredLibraries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return libraries;
    return libraries.filter(
      (lib) =>
        lib.library.name.toLowerCase().includes(query) ||
        lib.library.description.toLowerCase().includes(query) ||
        lib.library.authors.some((author) => author.name.toLowerCase().includes(query)),
    );
  }, [libraries, searchQuery]);

  const toggleLibrary = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleInsert = useCallback(
    (libraryId: string, item: ExcalidrawElement[], files?: any) => {
      if (!excalidrawAPI) return;
      const key = `${libraryId}:${item[0]?.id ?? "item"}`;
      setInsertingKey(key);
      try {
        insertLibraryItem(excalidrawAPI, item, files);
      } finally {
        setInsertingKey(null);
      }
    },
    [excalidrawAPI],
  );

  return (
    <div
      className="absolute inset-y-0 right-0 z-40 flex w-72 flex-col border-l bg-card sm:w-80"
      style={{ borderColor: "var(--sidebar-border)" }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon icon="lucide:shapes" className="h-4 w-4" />
          Components
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="Close components"
        >
          <Icon icon="lucide:x" className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pb-2 pt-2">
        <div className="relative">
          <Icon
            icon="lucide:search"
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder="Search libraries…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="pl-8"
          />
        </div>
      </div>

      {/* Library list */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Icon icon="lucide:loader-2" className="h-5 w-5 animate-spin" />
            <span className="text-xs">Loading components…</span>
          </div>
        )}

        {!loading && filteredLibraries.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Icon icon="lucide:shapes" className="h-8 w-8 opacity-30" />
            <p className="max-w-40 text-xs">
              {searchQuery
                ? `No libraries match "${searchQuery}"`
                : "No components yet. Install libraries from the Libraries panel in the sidebar."}
            </p>
          </div>
        )}

        {filteredLibraries.map(({ library, items, files }) => {
          const isOpen = !!expanded[library.id];
          return (
            <div
              key={library.id}
              className="overflow-hidden rounded border border-border/60 bg-background/50"
            >
              <button
                type="button"
                onClick={() => toggleLibrary(library.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent/60"
              >
                <span className="truncate">{library.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  <span>{items.length}</span>
                  <Icon
                    icon={isOpen ? "lucide:chevron-down" : "lucide:chevron-right"}
                    className="h-3.5 w-3.5"
                  />
                </span>
              </button>

              {isOpen && (
                <div className="grid grid-cols-3 gap-1.5 border-t border-border/60 bg-muted/30 p-2">
                  {items.map((item, index) => {
                    const itemId = item[0]?.id ?? `item-${index}`;
                    const key = `${library.id}:${itemId}`;
                    return (
                      <ItemThumb
                        key={key}
                        item={item}
                        files={files}
                        label={`${library.name} component`}
                        onClick={() => handleInsert(library.id, item, files)}
                        disabled={insertingKey === key}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
