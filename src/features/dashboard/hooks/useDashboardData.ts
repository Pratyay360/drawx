import { useEffect } from "react";
import { useDashboardStore } from "../../../stores/dashboard.ts";

export function useDashboardData() {
	const canvases = useDashboardStore((s) => s.canvases);
	const isLoading = useDashboardStore((s) => s.isLoading);
	const loadError = useDashboardStore((s) => s.loadError);
	const reload = useDashboardStore((s) => s.reload);

	// Initial load + listen for canvas-updated events
	useEffect(() => {
		void reload();
		const onUpdate = () => void reload();
		globalThis.addEventListener("canvas-updated", onUpdate);
		return () => globalThis.removeEventListener("canvas-updated", onUpdate);
	}, [reload]);

	return { canvases, isLoading, loadError, reload };
}
