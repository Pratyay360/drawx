import { useState, useEffect } from "react";
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
	fetchLibraryContent,
	searchLibraries,
	type ExcalidrawLibrary,
} from "../services/libraries.ts";

interface LibraryBrowserProps {
	onLibrarySelect?: (library: ExcalidrawLibrary) => void;
}

export function LibraryBrowser({ onLibrarySelect }: LibraryBrowserProps) {
	const [libraries, setLibraries] = useState<ExcalidrawLibrary[]>([]);
	const [filteredLibraries, setFilteredLibraries] = useState<
		ExcalidrawLibrary[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [downloadingId, setDownloadingId] = useState<string | null>(null);

	useEffect(() => {
		fetchLibraries().then((libs) => {
			setLibraries(libs);
			setFilteredLibraries(libs);
			setLoading(false);
		});
	}, []);

	useEffect(() => {
		if (searchQuery) {
			setFilteredLibraries(searchLibraries(libraries, searchQuery));
		} else {
			setFilteredLibraries(libraries);
		}
	}, [searchQuery, libraries]);

	async function handleDownload(library: ExcalidrawLibrary) {
		setDownloadingId(library.id);
		try {
			const content = await fetchLibraryContent(library);
			if (!content) return;
			const blob = new Blob([JSON.stringify(content, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${library.name}.excalidraw`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			setDownloadingId(null);
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
					All community libraries are loaded by default
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
							{filteredLibraries.map((library) => (
								<TableRow
									key={library.id}
									onClick={() => onLibrarySelect?.(library)}
									className="cursor-pointer"
								>
									<TableCell className="font-medium">{library.name}</TableCell>
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
											onClick={() => handleDownload(library)}
											disabled={downloadingId === library.id}
											className="p-1.5 rounded hover:bg-accent transition-colors"
											title={`Download ${library.name}`}
											aria-label={`Download ${library.name}`}
										>
											{downloadingId === library.id ? (
												<Icon
													icon="lucide:loader-2"
													className="w-4 h-4 animate-spin"
												/>
											) : (
												<Icon icon="lucide:download" className="w-4 h-4" />
											)}
										</button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				{filteredLibraries.length === 0 && (
					<div className="text-center py-8 text-muted-foreground">
						No libraries found matching your search.
					</div>
				)}

				<div className="text-sm text-muted-foreground">
					{filteredLibraries.length} of {libraries.length} libraries
				</div>
			</CardContent>
		</Card>
	);
}
