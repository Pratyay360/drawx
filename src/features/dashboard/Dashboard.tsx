import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
	FileText,
	Grid2x2,
	List,
	Loader2,
	PenTool,
	Plus,
	Search,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "../../components/sidebar.tsx";
import { useDashboardStore, type ViewMode } from "../../stores/dashboard.ts";
import { CanvasGrid } from "./components/CanvasGrid.tsx";
import { CanvasTable } from "./components/CanvasTable.tsx";
import { useDashboardData } from "./hooks/useDashboardData.ts";

function isViewMode(value: string): value is ViewMode {
	return value === "grid" || value === "list";
}

function parseViewMode(value: string): ViewMode {
	return isViewMode(value) ? value : "grid";
}

function _parseFileInput(value: File | File[] | null | undefined): File | null {
	if (value === null || value === undefined) return null;
	if (value instanceof File) return value;
	if (Array.isArray(value) && value[0] instanceof File) return value[0];
	return null;
}

export function Dashboard() {
	const [name, setName] = useState("");
	const { canvases, isLoading, loadError, reload } = useDashboardData();
	const navigate = useNavigate();

	// Store state
	const searchQuery = useDashboardStore((s) => s.searchQuery);
	const viewMode = useDashboardStore((s) => s.viewMode);
	const editingId = useDashboardStore((s) => s.editingId);
	const editTitle = useDashboardStore((s) => s.editTitle);
	const deletingId = useDashboardStore((s) => s.deletingId);
	const isCreating = useDashboardStore((s) => s.isCreating);

	// Store actions
	const createNewCanvas = useDashboardStore((s) => s.createNewCanvas);
	const deleteCanvasById = useDashboardStore((s) => s.deleteCanvasById);
	const renameCanvas = useDashboardStore((s) => s.renameCanvas);
	const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);
	const setViewMode = useDashboardStore((s) => s.setViewMode);
	const startEditing = useDashboardStore((s) => s.startEditing);
	const cancelEditing = useDashboardStore((s) => s.cancelEditing);
	const setEditTitle = useDashboardStore((s) => s.setEditTitle);

	const handleCreateCanvas = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			if (!name.trim()) return;
			const newCanvas = await createNewCanvas(name.trim());
			setName("");
			navigate(`/canvas/${newCanvas.id}`);
		},
		[name, navigate, createNewCanvas],
	);

	const handleQuickCreate = useCallback(async () => {
		const now = new Date();
		const title = now.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
		const newCanvas = await createNewCanvas(title);
		navigate(`/canvas/${newCanvas.id}`);
	}, [navigate, createNewCanvas]);

	const handleDeleteCanvas = useCallback(
		async (canvasId: string, e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			await deleteCanvasById(canvasId);
		},
		[deleteCanvasById],
	);

	const handleStartEditing = useCallback(
		(canvasId: string, currentTitle: string, e: React.MouseEvent) => {
			e.stopPropagation();
			startEditing(canvasId, currentTitle);
		},
		[startEditing],
	);

	const handleRename = useCallback(
		async (canvasId: string, e?: React.FormEvent) => {
			if (e) e.preventDefault();
			const currentEditTitle = useDashboardStore.getState().editTitle;
			await renameCanvas(canvasId, currentEditTitle);
		},
		[renameCanvas],
	);

	const handleTitleKeyDown = useCallback(
		(canvasId: string, e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				void handleRename(canvasId);
			} else if (e.key === "Escape") {
				cancelEditing();
			}
		},
		[handleRename, cancelEditing],
	);

	const handleSelectCanvas = useCallback(
		(canvasId: string, currentEditingId: string | null) => {
			if (currentEditingId !== canvasId) navigate(`/canvas/${canvasId}`);
		},
		[navigate],
	);

	const filteredCanvases = canvases.filter((canvas) =>
		canvas.title.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	return (
		<AppShell contentPadding={4} sideNav={<Sidebar />}>
			<VStack gap={5} maxWidth={960}>
				<HStack justify="between" align="center">
					<VStack gap={1}>
						<Heading level={1}>Drawings</Heading>
						<Text type="supporting">
							{canvases.length === 0
								? "Create your first drawing to get started."
								: `${canvases.length} ${canvases.length === 1 ? "drawing" : "drawings"} · your canvases`}
						</Text>
					</VStack>
					<HStack gap={2} align="center">
						<SegmentedControl
							value={viewMode}
							onChange={(value) => setViewMode(parseViewMode(value))}
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
						<Button
							label="New canvas"
							icon={<Icon icon={Plus} size="sm" />}
							onClick={handleQuickCreate}
							isLoading={isCreating}
						/>
					</HStack>
				</HStack>

				<form onSubmit={handleCreateCanvas}>
					<HStack gap={2}>
						<TextInput
							label="New drawing name"
							isLabelHidden
							placeholder="New drawing name..."
							value={name}
							onChange={setName}
							isDisabled={isCreating}
							width={320}
						/>
						<Button
							label={isCreating ? "Creating..." : "Create"}
							type="submit"
							isDisabled={isCreating || !name.trim()}
							isLoading={isCreating}
						/>
					</HStack>
				</form>

				<HStack gap={2} align="center">
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
					{filteredCanvases.length !== canvases.length && (
						<Text type="supporting">
							{filteredCanvases.length} of {canvases.length}
						</Text>
					)}
				</HStack>

				<FileInput
					label="Import drawing"
					accept=".json,.drawx"
					description="Supports .json or .drawx files"
					maxSize={10 * 1024 * 1024}
					mode="dropzone"
					placeholder="Drop a drawing file here"
					width={480}
					value={null}
					onChange={() => {}}
				/>

				{isLoading && canvases.length === 0 ? (
					<Card variant="muted" padding={6}>
						<Center>
							<VStack gap={2} hAlign="center">
								<Icon icon={Loader2} size="lg" />
								<Text type="supporting">Loading drawings…</Text>
								<Text type="supporting">Slow network — hang tight</Text>
							</VStack>
						</Center>
					</Card>
				) : loadError ? (
					<Card variant="muted" padding={6}>
						<Center>
							<VStack gap={3} hAlign="center" maxWidth={400}>
								<Text weight="medium">Failed to load drawings</Text>
								<Text type="supporting" justify="center">
									{loadError}
								</Text>
								<Button
									label="Retry"
									icon={<Icon icon={Loader2} size="sm" />}
									onClick={reload}
								/>
								{canvases.length > 0 && (
									<Text type="supporting">Showing cached drawings below</Text>
								)}
							</VStack>
						</Center>
					</Card>
				) : filteredCanvases.length > 0 ? (
					<>
						{isLoading && (
							<HStack gap={2} align="center">
								<Icon icon={Loader2} size="sm" />
								<Text type="supporting">Refreshing…</Text>
							</HStack>
						)}
						{viewMode === "grid" ? (
							<CanvasGrid
								canvases={filteredCanvases}
								editingId={editingId}
								editTitle={editTitle}
								deletingId={deletingId}
								onSelect={handleSelectCanvas}
								onStartEdit={handleStartEditing}
								onDelete={handleDeleteCanvas}
								onEditTitleChange={setEditTitle}
								onTitleKeyDown={handleTitleKeyDown}
								onRename={(canvasId) => void handleRename(canvasId)}
								onCancelEdit={cancelEditing}
							/>
						) : (
							<CanvasTable
								canvases={filteredCanvases}
								editingId={editingId}
								editTitle={editTitle}
								deletingId={deletingId}
								onSelect={handleSelectCanvas}
								onStartEdit={handleStartEditing}
								onDelete={handleDeleteCanvas}
								onEditTitleChange={setEditTitle}
								onTitleKeyDown={handleTitleKeyDown}
								onRename={(canvasId) => void handleRename(canvasId)}
								onCancelEdit={cancelEditing}
							/>
						)}
					</>
				) : canvases.length === 0 ? (
					<Card variant="muted" padding={6}>
						<Center>
							<VStack gap={3} hAlign="center">
								<Icon icon={PenTool} size="lg" />
								<VStack gap={1} hAlign="center">
									<Text weight="medium">No drawings yet</Text>
									<Text type="supporting">
										Start sketching — changes save automatically.
									</Text>
								</VStack>
								<Button
									label="Create your first drawing"
									icon={<Icon icon={Plus} size="sm" />}
									onClick={handleQuickCreate}
									isLoading={isCreating}
								/>
							</VStack>
						</Center>
					</Card>
				) : (
					<Center>
						<VStack gap={3} hAlign="center">
							<Icon icon={FileText} size="lg" />
							<Text type="supporting">
								No results for &quot;{searchQuery}&quot;
							</Text>
							<Button
								label="Clear search"
								variant="ghost"
								size="sm"
								onClick={() => setSearchQuery("")}
							/>
						</VStack>
					</Center>
				)}
			</VStack>
		</AppShell>
	);
}
