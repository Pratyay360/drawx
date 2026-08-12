import { Icon } from "@iconify/react";
import { useCallback, useEffect, useState } from "react";
import {
  type ExcalidrawLibrary,
  fetchLibraries,
  fetchLibraryContent,
  getLibraryAssetUrl,
  getSavedLibraries,
  installLibraryItems,
  libraryItemCount,
  onLibraryConfigUpdated,
  removeLibraryFromConfig,
  type SavedLibrary,
  saveLibraryContent,
  saveLibraryToConfig,
  searchLibraries,
  toLibraryItems,
} from "../services/libraries.ts";
import { LibraryItemBrowser } from "./library-item-browser.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx";

interface LibraryBrowserProps {
  onLibrarySelect?: (library: ExcalidrawLibrary) => void;
  initialBrowseId?: string | null;
  source?: "sidebar" | "canvas";
}

function formatFetchedAt(fetchedAt: string | null): string {
  if (!fetchedAt) return "Content not downloaded";
  const date = new Date(fetchedAt);
  if (Number.isNaN(date.getTime())) return "Content not downloaded";
  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function LibraryBrowser({
  onLibrarySelect,
  initialBrowseId = null,
  source = "canvas",
}: LibraryBrowserProps) {
  const [libraries, setLibraries] = useState<ExcalidrawLibrary[]>([]);
  const [filteredLibraries, setFilteredLibraries] = useState<ExcalidrawLibrary[]>([]);
  const [savedLibraries, setSavedLibraries] = useState<SavedLibrary[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [browsingId, setBrowsingId] = useState<string | null>(initialBrowseId);
  const [pendingBrowseId, setPendingBrowseId] = useState<string | null>(initialBrowseId);

  const refreshSaved = useCallback(async () => {
    const saved = await getSavedLibraries();
    setSavedLibraries(saved);
    setSavedLoaded(true);
  }, []);

  useEffect(() => {
    if (pendingBrowseId == null) return;
    if (savedLibraries.some((lib) => lib.id === pendingBrowseId)) {
      setBrowsingId(pendingBrowseId);
      setPendingBrowseId(null);
    } else if (savedLoaded) {
      // The library isn't saved anymore — fall back to the main view.
      setPendingBrowseId(null);
    }
  }, [pendingBrowseId, savedLibraries, savedLoaded]);

  useEffect(() => {
    fetchLibraries().then((libs) => {
      setLibraries(libs);
      setFilteredLibraries(libs);
      setLoading(false);
    });
    refreshSaved();
    return onLibraryConfigUpdated(() => {
      refreshSaved();
    });
  }, [refreshSaved]);

  useEffect(() => {
    if (searchQuery) {
      setFilteredLibraries(searchLibraries(libraries, searchQuery));
    } else {
      setFilteredLibraries(libraries);
    }
  }, [searchQuery, libraries]);

  const isSaved = useCallback(
    (libraryId: string) => savedLibraries.some((lib) => lib.id === libraryId),
    [savedLibraries],
  );

  async function handleToggleSave(library: ExcalidrawLibrary) {
    if (isSaved(library.id)) {
      try {
        await removeLibraryFromConfig(library.id);
        setSavedLibraries((prev) => prev.filter((lib) => lib.id !== library.id));
      } catch (error) {
        console.error("Failed to remove library from config:", error);
      }
      return;
    }

    setSavingId(library.id);
    try {
      const saved: SavedLibrary = {
        id: library.id,
        name: library.name,
        description: library.description,
        authors: library.authors,
        source: library.source,
        preview: library.preview,
        created: library.created,
        updated: library.updated,
        version: library.version,
        item_names: library.itemNames || [],
        items: [],
        fetched_at: null,
      };
      await saveLibraryToConfig(saved);
      setSavedLibraries((prev) => [...prev.filter((lib) => lib.id !== library.id), saved]);

      // Download the content right away so the items are available
      // offline. If this fails (e.g. no connection), the bookmark stays
      // and can be downloaded later via the refresh action.
      const content = await fetchLibraryContent(library);
      if (content) {
        const items = toLibraryItems(content, library.id);
        await saveLibraryContent(library.id, library.itemNames || [], items);
        await installLibraryItems(items);
        await refreshSaved();
      }
    } catch (error) {
      console.error("Failed to save library to config:", error);
    } finally {
      setSavingId(null);
    }
  }

  async function handleRefreshLibrary(saved: SavedLibrary) {
    setRefreshingId(saved.id);
    try {
      const catalogLibrary = libraries.find((lib) => lib.id === saved.id);
      const library: ExcalidrawLibrary = catalogLibrary ?? {
        id: saved.id,
        name: saved.name,
        description: saved.description,
        authors: saved.authors,
        source: saved.source,
        preview: saved.preview,
        created: saved.created,
        updated: saved.updated,
        version: saved.version,
      };
      const content = await fetchLibraryContent(library);
      if (content) {
        const items = toLibraryItems(content, saved.id);
        await saveLibraryContent(saved.id, library.itemNames || [], items);
        await installLibraryItems(items);
      }
      await refreshSaved();
    } catch (error) {
      console.error("Failed to refresh library:", error);
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleRemoveLibrary(saved: SavedLibrary) {
    setRemovingId(saved.id);
    try {
      await removeLibraryFromConfig(saved.id);
      setSavedLibraries((prev) => prev.filter((lib) => lib.id !== saved.id));
    } catch (error) {
      console.error("Failed to remove library from config:", error);
    } finally {
      setRemovingId(null);
    }
  }

  const browsingLibrary = savedLibraries.find((lib) => lib.id === browsingId) ?? null;

  if (loading || (pendingBrowseId != null && !savedLoaded)) {
    return (
      <div className="flex items-center justify-center p-8">
        <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (browsingLibrary) {
    return (
      <LibraryItemBrowser
        library={browsingLibrary}
        source={source}
        onBack={() => setBrowsingId(null)}
        onRefreshContent={() => handleRefreshLibrary(browsingLibrary)}
      />
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="lucide:library" className="w-5 h-5" />
          Excalidraw Libraries
        </CardTitle>
        <CardDescription>
          Save a library to download its components into your library panel — they stay available
          offline
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {savedLibraries.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Icon icon="lucide:bookmark-check" className="w-4 h-4" />
              Saved libraries
              <span className="text-xs font-normal text-muted-foreground">
                ({savedLibraries.length})
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedLibraries.map((saved) => {
                const refreshing = refreshingId === saved.id;
                const removing = removingId === saved.id;
                return (
                  <div key={saved.id} className="rounded-lg border bg-card p-3 space-y-2 group">
                    <div className="flex items-center gap-3">
                      {saved.preview ? (
                        <img
                          src={getLibraryAssetUrl(saved.preview)}
                          alt={`${saved.name} preview`}
                          className="w-14 h-10 object-cover rounded shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-10 rounded bg-accent flex items-center justify-center shrink-0">
                          <Icon icon="lucide:library" className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{saved.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {libraryItemCount(saved)} items · {formatFetchedAt(saved.fetched_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pt-1 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => handleRefreshLibrary(saved)}
                        disabled={refreshing || removing}
                        title="Download latest content"
                      >
                        {refreshing ? (
                          <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Icon icon="lucide:refresh-cw" className="w-3.5 h-3.5" />
                        )}
                        Refresh
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => setBrowsingId(saved.id)}
                        disabled={refreshing || removing}
                        title={`Browse items in ${saved.name}`}
                      >
                        <Icon icon="lucide:eye" className="w-3.5 h-3.5" />
                        Browse
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 ml-auto"
                        onClick={() => handleRemoveLibrary(saved)}
                        disabled={refreshing || removing}
                        title="Remove bookmark (items stay in your library panel)"
                      >
                        {removing ? (
                          <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Icon icon="lucide:bookmark-x" className="w-3.5 h-3.5" />
                        )}
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Icon icon="lucide:compass" className="w-4 h-4" />
            Browse libraries
          </h3>

          <div className="relative mb-3">
            <Icon
              icon="lucide:search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="Search libraries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              className="pl-8"
            />
          </div>

          <div className="max-h-90 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead className="w-25">Preview</TableHead>
                  <TableHead className="w-22.5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLibraries.map((library, index) => {
                  const saved = savedLibraries.find((lib) => lib.id === library.id);
                  const saving = savingId === library.id;
                  return (
                    <TableRow
                      key={library.id ?? `${library.source}-${index}`}
                      onClick={() => onLibrarySelect?.(library)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{library.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-50 truncate">
                        {library.description}
                      </TableCell>
                      <TableCell className="text-sm">
                        {library.authors[0]?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {library.preview && (
                          <img
                            src={getLibraryAssetUrl(library.preview)}
                            alt={`${library.name} preview`}
                            className="w-16 h-12 object-cover rounded"
                          />
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => handleToggleSave(library)}
                          disabled={saving}
                          title={saved ? `Remove ${library.name}` : `Save ${library.name}`}
                          aria-label={
                            saved ? `Remove ${library.name} from saved` : `Save ${library.name}`
                          }
                        >
                          {saving ? (
                            <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" />
                          ) : saved ? (
                            <Icon icon="lucide:bookmark-check" className="w-3.5 h-3.5" />
                          ) : (
                            <Icon icon="lucide:bookmark-plus" className="w-3.5 h-3.5" />
                          )}
                          <span className="max-w-16 truncate">
                            {saved ? `${libraryItemCount(saved)} items` : "Save"}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {filteredLibraries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No libraries found matching your search.
            </div>
          )}
        </section>

        <div className="text-sm text-muted-foreground">
          {filteredLibraries.length} of {libraries.length} libraries · {savedLibraries.length} saved
        </div>
      </CardContent>
    </Card>
  );
}
