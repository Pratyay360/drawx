import { exportToSvg } from "@excalidraw/excalidraw";
import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";
import type { SavedLibrary } from "../services/libraries.ts";
import { Button } from "./ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";

interface LibraryItemBrowserProps {
	library: SavedLibrary;
	onBack: () => void;
	onRefreshContent: () => Promise<void>;
}

// Rendered thumbnails are cached by item id (ids are content-addressed, so the
// cache stays valid across modal opens and library refreshes).
const thumbnailUrlCache = new Map<string, string>();

// Thumbnail renders are queued so a library with many items doesn't burst
// the main thread with parallel SVG exports.
let thumbnailQueue: Promise<void> = Promise.resolve();

function enqueueThumbnailRender(task: () => Promise<void>): Promise<void> {
	const run = thumbnailQueue.then(task);
	thumbnailQueue = run.catch(() => {});
	return run;
}

interface LibraryItemThumbnailProps {
	itemId: string;
	elements: any[];
}

function LibraryItemThumbnail({ itemId, elements }: LibraryItemThumbnailProps) {
	const [url, setUrl] = useState<string | null>(
		() => thumbnailUrlCache.get(itemId) ?? null,
	);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (url) return;
		let cancelled = false;

		enqueueThumbnailRender(async () => {
			if (cancelled) return;
			// Skip if another effect run already rendered it (e.g. StrictMode
			// double-mount or a concurrent remount).
			const cachedUrl = thumbnailUrlCache.get(itemId);
			if (cachedUrl) {
				setUrl(cachedUrl);
				return;
			}
			try {
				const svg = await exportToSvg({
					elements,
					appState: {
						exportBackground: false,
						exportWithDarkMode: true,
					},
					files: null,
					exportPadding: 6,
					skipInliningFonts: true,
				});
				if (cancelled) return;
				const xml = new XMLSerializer().serializeToString(svg);
				const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
				if (thumbnailUrlCache.size >= 1000) thumbnailUrlCache.clear();
				thumbnailUrlCache.set(itemId, dataUrl);
				setUrl(dataUrl);
			} catch (error) {
				console.error("Failed to render library item thumbnail:", error);
				if (!cancelled) setFailed(true);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [itemId, elements, url]);

	if (url) {
		return (
			<img
				src={url}
				alt=""
				className="max-h-full max-w-full object-contain"
				draggable={false}
			/>
		);
	}
	if (failed) {
		return (
			<Icon icon="lucide:image-off" className="w-5 h-5 text-muted-foreground" />
		);
	}
	return (
		<Icon
			icon="lucide:loader-2"
			className="w-5 h-5 animate-spin text-muted-foreground"
		/>
	);
}
function getItemName(item: any, index: number, itemNames: string[]): string {
	return (
		item?.name?.trim() || itemNames?.[index]?.trim() || `Item ${index + 1}`
	);
}

// Most library items don't carry a name, so search also matches text drawn
// inside the item's elements (text elements and arrow labels).
function getItemSearchText(
	item: any,
	index: number,
	itemNames: string[],
): string {
	const parts: string[] = [];
	if (item?.name?.trim()) parts.push(item.name);
	if (itemNames?.[index]?.trim()) parts.push(itemNames[index]);
	if (Array.isArray(item?.elements)) {
		for (const element of item.elements) {
			if (element?.type === "text" && element?.text) {
				parts.push(element.text);
			} else if (element?.type === "arrow" && element?.label?.text) {
				parts.push(element.label.text);
			}
		}
	}
	return parts.join(" ").toLowerCase();
}

export function LibraryItemBrowser({
	library,
	onBack,
	onRefreshContent,
}: LibraryItemBrowserProps) {
	const [query, setQuery] = useState("");
	const [refreshing, setRefreshing] = useState(false);

	const hasContent = Array.isArray(library.items) && library.items.length > 0;
	const items = useMemo(() => {
		const raw = Array.isArray(library.items) ? library.items : [];
		const itemNames = Array.isArray(library.item_names)
			? library.item_names
			: [];
		const lowerQuery = query.trim().toLowerCase();
		return raw
			.map((item, index) => ({
				item,
				name: getItemName(item, index, itemNames),
				searchText: getItemSearchText(item, index, itemNames),
			}))
			.filter(
				({ name, searchText }) =>
					!lowerQuery ||
					name.toLowerCase().includes(lowerQuery) ||
					searchText.includes(lowerQuery),
			);
	}, [library.items, library.item_names, query]);

	// Escape clears the active search first, then goes back to the library list.
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			if (query.trim()) {
				setQuery("");
			} else {
				onBack();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [query, onBack]);

	async function handleRefresh() {
		setRefreshing(true);
		try {
			await onRefreshContent();
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<Card className="w-full">
			<CardHeader>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onBack}
						title="Back to libraries"
						aria-label="Back to libraries"
					>
						<Icon icon="lucide:arrow-left" className="w-4 h-4" />
					</Button>
					<div className="min-w-0 flex-1">
						<CardTitle className="flex items-center gap-2 truncate">
							<Icon icon="lucide:library" className="w-5 h-5 shrink-0" />
							<span className="truncate">{library.name}</span>
							<span className="text-xs font-normal text-muted-foreground shrink-0">
								{hasContent ? `${library.items.length} items` : "No items"}
							</span>
						</CardTitle>
						<CardDescription className="truncate">
							{library.description || "Saved library"}
						</CardDescription>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs gap-1 shrink-0"
						onClick={handleRefresh}
						disabled={refreshing}
						title="Download latest content"
					>
						{refreshing ? (
							<Icon
								icon="lucide:loader-2"
								className="w-3.5 h-3.5 animate-spin"
							/>
						) : (
							<Icon icon="lucide:refresh-cw" className="w-3.5 h-3.5" />
						)}
						Refresh
					</Button>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{hasContent ? (
					<>
						<div className="relative">
							<Icon
								icon="lucide:search"
								className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
							/>
							<Input
								type="text"
								placeholder={`Search ${library.items.length} items...`}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className={`pl-8 ${query ? "pr-8" : ""}`}
								aria-label={`Search items in ${library.name}`}
							/>
							{query && (
								<button
									type="button"
									onClick={() => setQuery("")}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
									title="Clear search"
									aria-label="Clear search"
								>
									<Icon icon="lucide:x" className="w-3.5 h-3.5" />
								</button>
							)}
						</div>

						{items.length > 0 ? (
							<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
								{items.map(({ item, name }, index) => (
									<div
										key={item.id || `${library.id}-${index}`}
										className="group rounded-lg border bg-card p-2 transition-colors hover:border-primary/50"
										title={name}
									>
										<div className="aspect-[4/3] w-full rounded bg-accent/50 flex items-center justify-center overflow-hidden p-1">
											<LibraryItemThumbnail
												itemId={item.id || `${library.id}-${index}`}
												elements={item.elements || []}
											/>
										</div>
										<p className="mt-1.5 text-xs text-muted-foreground truncate">
											{name}
										</p>
									</div>
								))}
							</div>
						) : (
							<div className="text-center py-8 text-muted-foreground">
								No items match your search.
							</div>
						)}
					</>
				) : (
					<div className="flex flex-col items-center gap-3 py-10 text-center">
						<Icon
							icon="lucide:download-cloud"
							className="w-8 h-8 text-muted-foreground"
						/>
						<div>
							<p className="text-sm font-medium">Content not downloaded yet</p>
							<p className="text-xs text-muted-foreground mt-1">
								Download this library to browse and use its items.
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={handleRefresh}
							disabled={refreshing}
							className="gap-1"
						>
							{refreshing ? (
								<Icon
									icon="lucide:loader-2"
									className="w-3.5 h-3.5 animate-spin"
								/>
							) : (
								<Icon icon="lucide:download" className="w-3.5 h-3.5" />
							)}
							Download items
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
