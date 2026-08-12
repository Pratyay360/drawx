import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import {
  getLibraryAssetUrl,
  getSavedLibraries,
  libraryItemCount,
  onLibraryConfigUpdated,
  requestLibraryBrowse,
  type SavedLibrary,
} from "../services/libraries.ts";
import { Button } from "./ui/button.tsx";

/**
 * Rendered inside the Excalidraw default sidebar (next to the Library tab).
 * Lists saved libraries and lets the user open the library browser at any of
 * them without leaving the canvas.
 */
export function LibraryPanelTab() {
  const [savedLibraries, setSavedLibraries] = useState<SavedLibrary[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      getSavedLibraries().then((saved) => {
        if (active) setSavedLibraries(saved);
      });
    };
    load();
    const unsubscribe = onLibraryConfigUpdated(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-y-auto">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:library" className="w-4 h-4" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Drawx libraries</h3>
      </div>

      {savedLibraries.length > 0 ? (
        <ul className="space-y-1.5">
          {savedLibraries.map((library) => (
            <li key={library.id}>
              <button
                type="button"
                onClick={() => requestLibraryBrowse(library.id)}
                className="w-full flex items-center gap-2.5 p-2 rounded-md border bg-card hover:border-primary/50 transition-colors text-left"
                title={`Browse items in ${library.name}`}
              >
                {library.preview ? (
                  <img
                    src={getLibraryAssetUrl(library.preview)}
                    alt=""
                    className="w-9 h-7 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="w-9 h-7 rounded bg-accent flex items-center justify-center shrink-0">
                    <Icon
                      icon="lucide:library"
                      className="w-3.5 h-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{library.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {libraryItemCount(library)} items
                  </p>
                </div>
                <Icon
                  icon="lucide:eye"
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-6 px-2">
          <p className="text-xs text-muted-foreground mb-3">
            No saved libraries yet. Save one to browse and use its items on your canvas.
          </p>
        </div>
      )}

      <div className="mt-auto pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs gap-1"
          onClick={() => requestLibraryBrowse(null)}
          title="Open the full library browser"
        >
          <Icon icon="lucide:compass" className="w-3.5 h-3.5" />
          Open library browser
        </Button>
      </div>
    </div>
  );
}
