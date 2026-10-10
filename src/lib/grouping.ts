import type { Canvas } from "../services/tauri.ts";

export type GroupedCanvases = {
	Today: Canvas[];
	Older: Canvas[];
};

export function groupCanvasesByDate(canvases: Canvas[]): GroupedCanvases {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const grouped: GroupedCanvases = {
		Today: [],
		Older: [],
	};
	for (const canvas of canvases) {
		const canvasDate = new Date(canvas.updatedAt);
		if (canvasDate >= today) {
			grouped.Today.push(canvas);
		} else {
			grouped.Older.push(canvas);
		}
	}
	return grouped;
}
