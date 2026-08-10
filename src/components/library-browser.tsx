import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Input } from "./ui/input.tsx";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "./ui/card.tsx";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table.tsx";
import {
	fetchLibraries,
	searchLibraries,
	getSavedLibraries,
	saveLibraryToConfig,
	removeLibraryFromConfig,
	type ExcalidrawLibrary,
	type SavedLibrary,
} from "../services/libraries.ts";

interface LibraryBrowserProps {
	onLibrarySelect?: (library: ExcalidrawLibrary) => void;
}

export function LibraryBrowser({ onLibrarySelect }: LibraryBrowserProps) {
	const [libraries, setLibraries] = useState<ExcalidrawLibrary[]>([]);
	const [filteredLibraries, setFilteredLibraries] = useState<
		ExcalidrawLibrary[]
	>([]);
	const [savedLibraries, setSavedLibraries] = useState<SavedLibrary[]>([]);
	const [savingId, setSavingId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		fetchLibraries().then((libs) => {
			setLibraries(libs);
			setFilteredLibraries(libs);
			setLoading(false);
		});
		getSavedLibraries().then(setSavedLibraries);
	}, []);

	useEffect(() => {
		if (searchQuery) {
			setFilteredLibraries(searchLibraries(libraries, searchQuery));
		} else {
			setFilteredLibraries(libraries);
		}
	}, [searchQuery, libraries]);

	const isSaved = useCallback(
		(libraryId: string) =>
			savedLibraries.some((lib) => lib.id === libraryId),
		[savedLibraries],
	);

	async function handleToggleSave(library: ExcalidrawLibrary) {
		if (isSaved(library.id)) {
			try {
				await removeLibraryFromConfig(library.id);
				setSavedLibraries((prev) =>
					prev.filter((lib) => lib.id !== library.id),
				);
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
			};
			await saveLibraryToConfig(saved);
			setSavedLibraries((prev) => [...prev, saved]);
		} catch (error) {
			console.error("Failed to save library to config:", error);
		} finally {
			setSavingId(null);
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center p-8">
				<Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin" />
			</div>
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
					Save libraries to config to add their components to your canvas
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="relative">
					<Icon
						icon="lucide:search"
						className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
					/>
					<Input
						type="text"
						placeholder="Search libraries..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-8"
					/>
				</div>

				<div className="max-h-[400px] overflow-y-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Description</TableHead>
								<TableHead>Author</TableHead>
								<TableHead className="w-[100px]">Preview</TableHead>
								<TableHead className="w-[80px]"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredLibraries.map((library) => {
								const saved = isSaved(library.id);
								const saving = savingId === library.id;
								return (
									<TableRow
										key={library.id}
										onClick={() => onLibrarySelect?.(library)}
										className="cursor-pointer"
									>
										<TableCell className="font-medium">
											{library.name}
										</TableCell>
										<TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
											{library.description}
										</TableCell>
										<TableCell className="text-sm">
											{library.authors[0]?.name || "Unknown"}
										</TableCell>
										<TableCell>
											{library.preview && (
												<img
													src={`https://libraries.excalidraw.com/${library.preview}`}
													alt={`${library.name} preview`}
													className="w-16 h-12 object-cover rounded"
												/>
											)}
										</TableCell>
										<TableCell onClick={(e) => e.stopPropagation()}>
												<button
												type="button"
												onClick={() => handleToggleSave(library)}
												disabled={saving}
												className={`p-1.5 rounded transition-colors ${
													saved
														? "text-primary hover:bg-accent"
														: "text-muted-foreground hover:bg-accent"
												}`}
												title={saved ? `Remove ${library.name}` : `Save ${library.name}`}
												aria-label={
													saved
														? `Remove ${library.name} from saved`
														: `Save ${library.name}`
												}
											>
												{saving ? (
													<Icon
														icon="lucide:loader-2"
														className="w-4 h-4 animate-spin"
													/>
												) : (
													<Icon
														icon={saved ? "lucide:bookmark-check" : "lucide:bookmark-plus"}
														className="w-4 h-4"
													/>
												)}
											</button>
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

				<div className="text-sm text-muted-foreground">
					{filteredLibraries.length} of {libraries.length} libraries ·{" "}
					{savedLibraries.length} saved to config
				</div>
			</CardContent>
		</Card>
	);
}
