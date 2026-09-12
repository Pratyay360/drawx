/**
 * Human-friendly updated-at formatting for canvas cards and tables.
 * Extracted from Dashboard and Sidebar so both surfaces share the same copy.
 */
export function formatUpdatedAt(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const now = new Date();
	const sameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	if (sameDay) {
		return `Today at ${date.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		})}`;
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}
