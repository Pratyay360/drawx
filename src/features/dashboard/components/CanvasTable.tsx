import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack } from "@astryxdesign/core/Stack";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeaderCell,
	TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { formatUpdatedAt } from "../../../lib/format.ts";
import type { Canvas } from "../../../services/tauri.ts";

type CanvasTableProps = {
	canvases: Canvas[];
	editingId: string | null;
	editTitle: string;
	deletingId: string | null;
	onSelect: (id: string, editingId: string | null) => void;
	onStartEdit: (id: string, title: string, e: React.MouseEvent) => void;
	onDelete: (id: string, e: React.MouseEvent) => void;
	onEditTitleChange: (v: string) => void;
	onTitleKeyDown: (id: string, e: React.KeyboardEvent) => void;
	onRename: (id: string) => void;
	onCancelEdit: () => void;
};

export function CanvasTable({
	canvases,
	editingId,
	editTitle,
	deletingId,
	onSelect,
	onStartEdit,
	onDelete,
	onEditTitleChange,
	onTitleKeyDown,
	onRename,
	onCancelEdit,
}: CanvasTableProps) {
	return (
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
					{canvases.map((canvas) => (
						<TableRow
							key={canvas.id}
							onClick={() => onSelect(canvas.id, editingId)}
						>
							<TableCell>
								{editingId === canvas.id ? (
									<HStack gap={1}>
										<TextInput
											label="Rename drawing"
											isLabelHidden
											value={editTitle}
											onChange={onEditTitleChange}
											onKeyDown={(e) => onTitleKeyDown(canvas.id, e)}
											hasAutoFocus
											size="sm"
											width="100%"
										/>
										<IconButton
											label="Save name"
											variant="ghost"
											size="sm"
											icon={<Icon icon={Check} size="sm" />}
											onClick={() => onRename(canvas.id)}
										/>
										<IconButton
											label="Cancel rename"
											variant="ghost"
											size="sm"
											icon={<Icon icon={X} size="sm" />}
											onClick={onCancelEdit}
										/>
									</HStack>
								) : (
									<Text weight="medium">{canvas.title}</Text>
								)}
							</TableCell>
							<TableCell>
								<Text type="supporting">
									{formatUpdatedAt(canvas.updatedAt)}
								</Text>
							</TableCell>
							<TableCell onClick={(e) => e.stopPropagation()}>
								<HStack justify="end" gap={1}>
									<IconButton
										label={`Rename ${canvas.title}`}
										variant="ghost"
										size="sm"
										icon={<Icon icon={Pencil} size="sm" />}
										onClick={(e) => onStartEdit(canvas.id, canvas.title, e)}
									/>
									{deletingId === canvas.id ? (
										<Icon icon={Loader2} size="sm" />
									) : (
										<IconButton
											label={`Delete ${canvas.title}`}
											variant="ghost"
											size="sm"
											icon={<Icon icon={Trash2} size="sm" />}
											onClick={(e) => onDelete(canvas.id, e)}
										/>
									)}
								</HStack>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</Card>
	);
}
