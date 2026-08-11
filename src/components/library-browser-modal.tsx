import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { onLibraryBrowseRequested } from "../services/libraries.ts";
import { LibraryBrowser } from "./library-browser.tsx";
import { Button } from "./ui/button.tsx";

/**
 * Mounted once at the app root so the library browser is reachable from every
 * route — including the canvas, where the sidebar (which used to own this
 * modal) isn't rendered. Listens for the global browse-request event fired by
 * the in-canvas Drawx library panel tab and the sidebar's Libraries button.
 */
export function LibraryBrowserModal() {
	const [showLibraries, setShowLibraries] = useState(false);
	const [librariesBrowseId, setLibrariesBrowseId] = useState<string | null>(
		null,
	);

	useEffect(() => {
		return onLibraryBrowseRequested((libraryId) => {
			setLibrariesBrowseId(libraryId);
			setShowLibraries(true);
		});
	}, []);

	if (!showLibraries) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="bg-background rounded-lg shadow-lg p-4 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-lg font-semibold">Libraries</h2>
					<Button
						onClick={() => {
							setShowLibraries(false);
							setLibrariesBrowseId(null);
						}}
						className="p-1 rounded hover:bg-accent"
					>
						<Icon icon="lucide:x" className="w-5 h-5" />
					</Button>
				</div>
				<LibraryBrowser initialBrowseId={librariesBrowseId} />
			</div>
		</div>
	);
}
