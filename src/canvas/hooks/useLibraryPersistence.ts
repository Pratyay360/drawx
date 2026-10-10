import type { LibraryItem } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef } from "react";
import {
	getUserLibrary,
	onLibraryItemsInstalled,
	setUserLibrary,
} from "../../services/libraries.ts";
import { useCanvasStore } from "../../stores/canvas.ts";

type UseLibraryPersistenceReturn = {
	handleLibraryChange: (items: readonly LibraryItem[]) => void;
	initialLibraryItems: Promise<
		import("@excalidraw/excalidraw/types").LibraryItems
	>;
};

export function useLibraryPersistence(): UseLibraryPersistenceReturn {
	const excalidrawAPI = useCanvasStore((s) => s.excalidrawAPI);

	const librarySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const pendingLibraryRef = useRef<LibraryItem[] | null>(null);
	const initialLibraryItemsRef = useRef<Promise<
		import("@excalidraw/excalidraw/types").LibraryItems
	> | null>(null);
	initialLibraryItemsRef.current = getUserLibrary().then((items) => items);

	const handleLibraryChange = useCallback((items: readonly LibraryItem[]) => {
		pendingLibraryRef.current = [...items];
		if (librarySaveTimerRef.current !== null) {
			globalThis.clearTimeout(librarySaveTimerRef.current);
		}
		librarySaveTimerRef.current = globalThis.setTimeout(() => {
			const toSave = pendingLibraryRef.current;
			pendingLibraryRef.current = null;
			if (toSave) void setUserLibrary(toSave);
		}, 300);
	}, []);

	useEffect(() => {
		return () => {
			if (librarySaveTimerRef.current !== null) {
				globalThis.clearTimeout(librarySaveTimerRef.current);
				librarySaveTimerRef.current = null;
			}
			const toSave = pendingLibraryRef.current;
			pendingLibraryRef.current = null;
			if (toSave) void setUserLibrary(toSave);
		};
	}, []);

	useEffect(() => {
		if (!excalidrawAPI) return;
		return onLibraryItemsInstalled((items) => {
			excalidrawAPI.updateLibrary({ libraryItems: items, merge: true });
		});
	}, [excalidrawAPI]);

	return {
		handleLibraryChange,
		initialLibraryItems: initialLibraryItemsRef.current,
	};
}
