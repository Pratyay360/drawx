import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { LinkProvider } from "@astryxdesign/core/Link";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { FileInput } from "@astryxdesign/core/FileInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
	Check,
	FileText,
	Grid2x2,
	List,
	Pencil,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	BrowserRouter,
	Link,
	Route,
	Routes,
	useNavigate,
} from "react-router-dom";
import { Canvas as CanvasComponent } from "./canvas/main.tsx";
import { LibraryBrowserModal } from "./components/library-browser-modal.tsx";
import { Sidebar } from "./components/sidebar.tsx";
import { UpdatePrompt } from "./components/update-prompt.tsx";
import {
	type Canvas,
	createCanvas,
	deleteCanvas,
	isTauri,
	listCanvases,
	updateCanvasTitle,
} from "./services/tauri.ts";
import { checkForAppUpdates } from "./updater.ts";

// Run the update check once per session; it is a no-op outside Tauri.
let updateCheckStarted = false;

function maybeCheckForUpdates() {
	if (updateCheckStarted || !isTauri()) return;
	updateCheckStarted = true;
	void checkForAppUpdates();
}

function Dashboard() {
	const [name, setName] = useState("");
	const [canvases, setCanvases] = useState<Canvas[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [importFile, setImportFile] = useState<File | null>(null);
	const navigate = useNavigate();

	const loadDrawings = useCallback(async () => {
		try {
			const result = await listCanvases();
			setCanvases(result);
		} catch (error) {
			console.error("Failed to load drawings:", error);
		}
	}, []);

	useEffect(() => {
		loadDrawings();
	}, [loadDrawings]);

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

	function handleTitleKeyDown(id: string, e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			handleRename(id);
		} else if (e.key === "Escape") {
			handleCancelEdit();
		}
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
		<AppShell contentPadding={4} sideNav={<Sidebar />}>
			<VStack gap={5} maxWidth={960}>
				<HStack justify="between" align="center">
					<Heading level={1}>Drawx</Heading>
					<SegmentedControl
						value={viewMode}
						onChange={(value) => setViewMode(value as "grid" | "list")}
						label="Canvas view mode"
						size="sm"
					>
						<SegmentedControlItem
							value="grid"
							label="Grid view"
							isLabelHidden
							icon={<Icon icon={Grid2x2} size="sm" />}
						/>
						<SegmentedControlItem
							value="list"
							label="List view"
							isLabelHidden
							icon={<Icon icon={List} size="sm" />}
						/>
					</SegmentedControl>
				</HStack>

				<form onSubmit={handleCreateCanvas}>
					<HStack gap={2}>
						<TextInput
							label="New drawing name"
							isLabelHidden
							placeholder="New drawing name..."
							value={name}
							onChange={setName}
							isDisabled={loading}
							width={320}
						/>
						<Button
							label={loading ? "Creating..." : "Create"}
							type="submit"
							isDisabled={loading || !name.trim()}
						/>
					</HStack>
				</form>

				<TextInput
					label="Search drawings"
					isLabelHidden
					placeholder="Search..."
					value={searchQuery}
					onChange={setSearchQuery}
					startIcon={Search}
					hasClear
					width={256}
				/>

				<FileInput
					label="Import drawing"
					value={importFile}
					onChange={(file) => setImportFile(file as File | null)}
					accept=".json,.drawx"
					description="Supports .json or .drawx files"
					maxSize={10 * 1024 * 1024}
					mode="dropzone"
					placeholder="Drop a drawing file here"
					width={480}
				/>

				{filteredCanvases.length > 0 ? (
					viewMode === "grid" ? (
						<Grid columns={{ minWidth: 280, max: 3 }} gap={3}>
							{filteredCanvases.map((canvas) => (
								<ClickableCard
									key={canvas.id}
									label={`Open ${canvas.title}`}
									padding={3}
									onClick={() => {
										if (editingId !== canvas.id)
											navigate(`/canvas/${canvas.id}`);
									}}
								>
									<VStack gap={2}>
										<HStack justify="between" align="center">
											<Text weight="medium" maxLines={1}>
												{canvas.title}
											</Text>
											<HStack gap={1}>
												<IconButton
													label={`Rename ${canvas.title}`}
													variant="ghost"
													size="sm"
													icon={<Icon icon={Pencil} size="sm" />}
													onClick={(e) =>
														startEditing(canvas.id, canvas.title, e)
													}
												/>
												<IconButton
													label={`Delete ${canvas.title}`}
													variant="ghost"
													size="sm"
													icon={<Icon icon={Trash2} size="sm" />}
													onClick={(e) => handleDeleteCanvas(canvas.id, e)}
												/>
											</HStack>
										</HStack>
										{editingId === canvas.id ? (
											<HStack gap={1}>
												<TextInput
													label="Rename drawing"
													isLabelHidden
													value={editTitle}
													onChange={setEditTitle}
													onKeyDown={(e) => handleTitleKeyDown(canvas.id, e)}
													hasAutoFocus
													size="sm"
													width="100%"
												/>
												<IconButton
													label="Save name"
													variant="ghost"
													size="sm"
													icon={<Icon icon={Check} size="sm" />}
													onClick={() => handleRename(canvas.id)}
												/>
												<IconButton
													label="Cancel rename"
													variant="ghost"
													size="sm"
													icon={<Icon icon={X} size="sm" />}
													onClick={handleCancelEdit}
												/>
											</HStack>
										) : (
											<Text type="supporting">
												{formatDate(canvas.updatedAt)}
											</Text>
										)}
									</VStack>
								</ClickableCard>
							))}
						</Grid>
					) : (
						<Card padding={0}>
							<Table density="compact" hasHover>
								<TableHeader>
									<TableRow isHeaderRow>
										<TableHeaderCell>Title</TableHeaderCell>
										<TableHeaderCell>Updated</TableHeaderCell>
										<TableHeaderCell>Actions</TableHeaderCell>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredCanvases.map((canvas) => (
										<TableRow
											key={canvas.id}
											onClick={() => {
												if (editingId !== canvas.id)
													navigate(`/canvas/${canvas.id}`);
											}}
										>
											<TableCell>
												{editingId === canvas.id ? (
													<HStack gap={1}>
														<TextInput
															label="Rename drawing"
															isLabelHidden
															value={editTitle}
															onChange={setEditTitle}
															onKeyDown={(e) =>
																handleTitleKeyDown(canvas.id, e)
															}
															hasAutoFocus
															size="sm"
															width="100%"
														/>
														<IconButton
															label="Save name"
															variant="ghost"
															size="sm"
															icon={<Icon icon={Check} size="sm" />}
															onClick={() => handleRename(canvas.id)}
														/>
														<IconButton
															label="Cancel rename"
															variant="ghost"
															size="sm"
															icon={<Icon icon={X} size="sm" />}
															onClick={handleCancelEdit}
														/>
													</HStack>
												) : (
													<Text weight="medium">{canvas.title}</Text>
												)}
											</TableCell>
											<TableCell>
												<Text type="supporting">
													{formatDate(canvas.updatedAt)}
												</Text>
											</TableCell>
											<TableCell onClick={(e) => e.stopPropagation()}>
												<HStack justify="end" gap={1}>
													<IconButton
														label={`Rename ${canvas.title}`}
														variant="ghost"
														size="sm"
														icon={<Icon icon={Pencil} size="sm" />}
														onClick={(e) =>
															startEditing(canvas.id, canvas.title, e)
														}
													/>
													<IconButton
														label={`Delete ${canvas.title}`}
														variant="ghost"
														size="sm"
														icon={<Icon icon={Trash2} size="sm" />}
														onClick={(e) => handleDeleteCanvas(canvas.id, e)}
													/>
												</HStack>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</Card>
					)
				) : (
					<Center>
						<VStack gap={3} hAlign="center">
							<Icon icon={FileText} size="lg" />
							<Text type="supporting">
								{searchQuery
									? `No results for "${searchQuery}"`
									: "No drawings yet. Create one above."}
							</Text>
							{searchQuery && (
								<Button
									label="Clear search"
									variant="ghost"
									size="sm"
									onClick={() => setSearchQuery("")}
								/>
							)}
						</VStack>
					</Center>
				)}
			</VStack>
		</AppShell>
	);
}

function App() {
	useEffect(() => {
		maybeCheckForUpdates();
	}, []);

	return (
		<BrowserRouter>
			<LinkProvider component={Link}>
				<Routes>
					<Route path="/" element={<Dashboard />} />
					<Route path="/canvas/:id" element={<CanvasComponent />} />
				</Routes>
				<LibraryBrowserModal />
				<UpdatePrompt />
			</LinkProvider>
		</BrowserRouter>
	);
}

export default App;
