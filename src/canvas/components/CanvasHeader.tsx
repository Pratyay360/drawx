import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowLeft, Pencil, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

type CanvasHeaderProps = {
	title: string;
	titleInput: string;
	isEditingTitle: boolean;
	saveStatus: "saved" | "unsaved" | "saving";
	onTitleInputChange: (v: string) => void;
	onTitleKeyDown: (e: React.KeyboardEvent) => void;
	onStartEditTitle: () => void;
	onManualSave: () => void;
};

export function CanvasHeader({
	title,
	titleInput,
	isEditingTitle,
	saveStatus,
	onTitleInputChange,
	onTitleKeyDown,
	onStartEditTitle,
	onManualSave,
}: CanvasHeaderProps) {
	const navigate = useNavigate();
	return (
		<LayoutHeader hasDivider padding={2}>
			<HStack justify="between" align="center">
				<HStack gap={2} align="center">
					<IconButton
						label="Back to workspace"
						variant="ghost"
						icon={<Icon icon={ArrowLeft} size="sm" />}
						onClick={() => navigate("/")}
						tooltip="Back to workspace"
					/>
					<Divider orientation="vertical" />
					{isEditingTitle ? (
						<TextInput
							label="Canvas title"
							isLabelHidden
							value={titleInput}
							onChange={onTitleInputChange}
							onKeyDown={onTitleKeyDown}
							hasAutoFocus
							size="sm"
							width={280}
						/>
					) : (
						<Button
							label={title || "Untitled"}
							variant="ghost"
							size="sm"
							icon={<Icon icon={Pencil} size="sm" />}
							onClick={onStartEditTitle}
							tooltip="Click to rename"
						/>
					)}
				</HStack>

				<HStack gap={2} align="center">
					<Text type="supporting">
						{saveStatus === "saving"
							? "Saving..."
							: saveStatus === "saved"
								? "Saved"
								: "Unsaved"}
					</Text>
					<IconButton
						label="Save"
						variant="ghost"
						icon={<Icon icon={Save} size="sm" />}
						tooltip="Save"
						isLoading={saveStatus === "saving"}
						isDisabled={saveStatus === "saved"}
						onClick={onManualSave}
					/>
				</HStack>
			</HStack>
		</LayoutHeader>
	);
}
