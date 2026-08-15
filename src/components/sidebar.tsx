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
} from "@astryxdesign/core/SideNav";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
	Database,
	Library,
	Loader2,
	PenTool,
	Plus,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

function groupCanvasesByDate(canvases: Canvas[]): {
	Today: Canvas[];
	Older: Canvas[];
} {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	const grouped: { Today: Canvas[]; Older: Canvas[] } = {
		Today: [],
		Older: [],
	};

	canvases.forEach((canvas) => {
		const canvasDate = new Date(canvas.updatedAt);
		if (canvasDate >= today) {
			grouped.Today.push(canvas);
		} else {
			grouped.Older.push(canvas);
		}
	});

	return grouped;
}

export function Sidebar() {
	const [isCollapsed, setIsCollapsed] = useState(
		() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
	);
	const [canvases, setCanvases] = useState<Canvas[]>([]);
	const [isCreating, setIsCreating] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const { id: currentCanvasId } = useParams();
	const navigate = useNavigate();

	useEffect(() => {
		localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
	}, [isCollapsed]);

	const loadCanvases = useCallback(async () => {
		try {
			const result = await listCanvases();
			setCanvases(result);
		} catch (error) {
			console.error("Failed to load canvases:", error);
		}
	}, []);

	useEffect(() => {
		loadCanvases();
		window.addEventListener("canvas-updated", loadCanvases);
		return () => window.removeEventListener("canvas-updated", loadCanvases);
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
			const newCanvas = await createCanvas(title);
			window.dispatchEvent(new Event("canvas-updated"));
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
			await deleteCanvas(canvasId);
			window.dispatchEvent(new Event("canvas-updated"));
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
					<Button
						label="New canvas"
						icon={<Icon icon={Plus} size="sm" />}
						onClick={handleCreateCanvas}
						isLoading={isCreating}
						width="100%"
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
				{grouped.Today.length > 0 && (
					<SideNavSection title="Today">
						{grouped.Today.map((canvas) => (
							<SideNavItem
								key={canvas.id}
								label={canvas.title}
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
