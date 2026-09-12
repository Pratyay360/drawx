import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { formatUpdatedAt } from "../../../lib/format.ts";
import type { Canvas } from "../../../services/tauri.ts";

type CanvasGridProps = {
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

export function CanvasGrid({
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
}: CanvasGridProps) {
	return (
		<Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
			{canvases.map((canvas) => (
				<Card
					key={canvas.id}
					padding={3}
					onClick={() => onSelect(canvas.id, editingId)}
				>
					<VStack gap={2}>
						<HStack justify="between" align="center" gap={2}>
							<VStack gap={0} width="100%">
								<Text weight="medium" maxLines={1}>
									{canvas.title}
								</Text>
								<Text type="supporting">
									{formatUpdatedAt(canvas.updatedAt)}
								</Text>
							</VStack>
							<HStack gap={1}>
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
						</HStack>
						{editingId === canvas.id && (
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
						)}
					</VStack>
				</Card>
			))}
		</Grid>
	);
}
