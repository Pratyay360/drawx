import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
	SideNav,
	SideNavCollapseButton,
	SideNavHeading,
	SideNavItem,
	SideNavSection,
	useSideNavCollapse,
} from "@astryxdesign/core/SideNav";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
	Database,
	FileText,
	Library,
	Loader2,
	PenTool,
	Plus,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { withTimeout } from "../lib/async.ts";
import { groupCanvasesByDate } from "../lib/grouping.ts";
import { requestLibraryBrowse } from "../services/libraries.ts";
import {
	type Canvas,
	createCanvas,
	deleteCanvas,
	listCanvases,
} from "../services/tauri.ts";
import { DatabaseSettings } from "./database-settings.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

const SIDEBAR_COLLAPSED_KEY = "drawx-sidebar-collapsed";

function SidebarNewCanvasButton({
	onClick,
	isLoading,
}: {
	onClick: () => void;
	isLoading: boolean;
}) {
	const { isCollapsed } = useSideNavCollapse();
	if (isCollapsed) {
		return (
			<IconButton
				label="New canvas"
				tooltip="New canvas"
				icon={<Icon icon={Plus} size="sm" />}
				onClick={onClick}
				isLoading={isLoading}
				variant="primary"
			/>
		);
	}
	return (
		<Button
			label="New canvas"
			icon={<Icon icon={Plus} size="sm" />}
			onClick={onClick}
			isLoading={isLoading}
			width="100%"
		/>
	);
}

export function Sidebar() {
	const [isCollapsed, setIsCollapsed] = useState(
		() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
	);
	const [canvases, setCanvases] = useState<Canvas[]>([]);
	const [isLoadingCanvases, setIsLoadingCanvases] = useState(true);
	const [canvasesError, setCanvasesError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const { id: currentCanvasId } = useParams();
	const navigate = useNavigate();
	const loadSeqRef = useRef(0);

	useEffect(() => {
		localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
	}, [isCollapsed]);

	const canvasesRef = useRef(canvases);
	canvasesRef.current = canvases;

	const loadCanvases = useCallback(async () => {
		const seq = ++loadSeqRef.current;
		const hasStale = canvasesRef.current.length > 0;
		if (!hasStale) setIsLoadingCanvases(true);
		setCanvasesError(null);
		try {
			const result = await withTimeout(
				listCanvases(),
				12000,
				"Loading canvases",
			);
			if (seq !== loadSeqRef.current) return;
			setCanvases(result);
			setCanvasesError(null);
		} catch (error) {
			if (seq !== loadSeqRef.current) return;
			console.error("Failed to load canvases:", error);
			setCanvasesError(
				error instanceof Error ? error.message : "Failed to load canvases",
			);
		} finally {
			if (seq === loadSeqRef.current) setIsLoadingCanvases(false);
		}
	}, []);

	useEffect(() => {
		void loadCanvases();
		globalThis.addEventListener("canvas-updated", loadCanvases);
		return () => globalThis.removeEventListener("canvas-updated", loadCanvases);
	}, [loadCanvases]);

	async function handleCreateCanvas() {
		setIsCreating(true);
		try {
			const now = new Date();
			const title = now.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			const newCanvas = await withTimeout(
				createCanvas(title),
				12000,
				"Create canvas",
			);
			globalThis.dispatchEvent(new Event("canvas-updated"));
			navigate(`/canvas/${newCanvas.id}`);
		} catch (error) {
			console.error("Failed to create canvas:", error);
		} finally {
			setIsCreating(false);
		}
	}

	async function handleDeleteCanvas(canvasId: string, event: React.MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		setDeletingId(canvasId);
		try {
			await withTimeout(deleteCanvas(canvasId), 12000, "Delete canvas");
			globalThis.dispatchEvent(new Event("canvas-updated"));
			if (canvasId === currentCanvasId) {
				navigate("/");
			}
		} catch (error) {
			console.error("Failed to delete canvas:", error);
		} finally {
			setDeletingId(null);
		}
	}

	const grouped = groupCanvasesByDate(canvases);

	return (
		<>
			<SideNav
				collapsible={{
					isCollapsed,
					onCollapsedChange: setIsCollapsed,
					hasButton: false,
				}}
				resizable={{
					defaultWidth: 240,
					minWidth: 200,
					maxWidth: 320,
					autoSaveId: "drawx-sidebar-width",
				}}
				header={
					<SideNavHeading
						heading="Drawx"
						icon={<Icon icon={PenTool} size="sm" />}
						headingHref="/"
						as={Link}
					/>
				}
				topContent={
					<SidebarNewCanvasButton
						onClick={handleCreateCanvas}
						isLoading={isCreating}
					/>
				}
				footerIcons={
					<>
						<IconButton
							label="Database settings"
							tooltip="Database Settings"
							variant="ghost"
							icon={<Icon icon={Database} size="sm" />}
							onClick={() => setShowSettings(true)}
						/>
						<IconButton
							label="Libraries"
							tooltip="Libraries"
							variant="ghost"
							icon={<Icon icon={Library} size="sm" />}
							onClick={() => requestLibraryBrowse(null)}
						/>
						<ThemeToggle />
						<SideNavCollapseButton />
					</>
				}
			>
				{isLoadingCanvases && canvases.length === 0 ? (
					<SideNavSection title="Loading" isHeaderHidden>
						<VStack gap={2} hAlign="center" padding={3}>
							<Icon icon={Loader2} size="sm" />
							<Text type="supporting">Loading drawings…</Text>
							<Text type="supporting">Slow network — hang tight</Text>
						</VStack>
					</SideNavSection>
				) : canvasesError ? (
					<SideNavSection title="Error" isHeaderHidden>
						<VStack gap={2} hAlign="center" padding={3}>
							<Text type="supporting" maxLines={3}>
								{canvasesError}
							</Text>
							<Button
								label="Retry"
								variant="ghost"
								size="sm"
								icon={<Icon icon={Loader2} size="sm" />}
								onClick={loadCanvases}
							/>
							{canvases.length > 0 && (
								<Text type="supporting">Showing cached drawings</Text>
							)}
						</VStack>
					</SideNavSection>
				) : (
					<>
						{grouped.Today.length > 0 && (
							<SideNavSection title="Today">
								{grouped.Today.map((canvas) => (
									<SideNavItem
										key={canvas.id}
										label={canvas.title}
										icon={FileText}
										href={`/canvas/${canvas.id}`}
										as={Link}
										isSelected={canvas.id === currentCanvasId}
										endContent={
											deletingId === canvas.id ? (
												<Icon icon={Loader2} size="sm" />
											) : (
												<IconButton
													label="Delete canvas"
													variant="ghost"
													size="sm"
													icon={<Icon icon={Trash2} size="sm" />}
													onClick={(e) => handleDeleteCanvas(canvas.id, e)}
												/>
											)
										}
									/>
								))}
							</SideNavSection>
						)}

						{grouped.Older.length > 0 && (
							<SideNavSection title="Older">
								{grouped.Older.map((canvas) => (
									<SideNavItem
										key={canvas.id}
										label={canvas.title}
										icon={FileText}
										href={`/canvas/${canvas.id}`}
										as={Link}
										isSelected={canvas.id === currentCanvasId}
										endContent={
											deletingId === canvas.id ? (
												<Icon icon={Loader2} size="sm" />
											) : (
												<IconButton
													label="Delete canvas"
													variant="ghost"
													size="sm"
													icon={<Icon icon={Trash2} size="sm" />}
													onClick={(e) => handleDeleteCanvas(canvas.id, e)}
												/>
											)
										}
									/>
								))}
							</SideNavSection>
						)}

						{canvases.length === 0 && (
							<SideNavSection title="Drawings" isHeaderHidden>
								<VStack gap={2} hAlign="center" padding={3}>
									<Text type="supporting">No drawings yet</Text>
									<Button
										label="Create one"
										variant="ghost"
										size="sm"
										onClick={handleCreateCanvas}
									/>
								</VStack>
							</SideNavSection>
						)}
						{isLoadingCanvases && canvases.length > 0 && (
							<HStack gap={1} hAlign="center" padding={2}>
								<Icon icon={Loader2} size="sm" />
								<Text type="supporting">Refreshing…</Text>
							</HStack>
						)}
					</>
				)}
			</SideNav>

			<Dialog
				isOpen={showSettings}
				onOpenChange={setShowSettings}
				width={480}
				purpose="form"
			>
				<DatabaseSettings onClose={() => setShowSettings(false)} />
			</Dialog>
		</>
	);
}
