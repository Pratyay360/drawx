import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Star } from "lucide-react";
import { useCallback, useState } from "react";

const DISMISSED_KEY = "drawx-star-prompt-dismissed";
const REPO_URL = "https://github.com/pratyay360/drawx";

export function StarPrompt() {
	const [isOpen, setIsOpen] = useState(
		() => localStorage.getItem(DISMISSED_KEY) !== "true",
	);

	const handleDismiss = useCallback(() => {
		try {
			localStorage.setItem(DISMISSED_KEY, "true");
		} catch {
			// Ignore storage errors (e.g. private browsing).
		}
		setIsOpen(false);
	}, []);

	const handleStar = () => {
		window.open(REPO_URL, "_blank");
	};

	return (
		<Dialog isOpen={isOpen} onOpenChange={setIsOpen} width={440} purpose="info">
			<Layout
				header={
					<DialogHeader
						title="Star Drawx on GitHub!"
						startContent={<Icon icon={Star} size="sm" />}
						onOpenChange={handleDismiss}
					/>
				}
				content={
					<LayoutContent padding={4}>
						<HStack gap={2}>
							<Text>
								If you like Drawx, please consider starring the repo on GitHub —
								it helps the project grow.
							</Text>
						</HStack>
					</LayoutContent>
				}
				footer={
					<LayoutFooter hasDivider padding={4}>
						<HStack justify="end" gap={2}>
							<Button
								label="Not Now"
								variant="secondary"
								onClick={handleDismiss}
							/>
							<Button
								label="Star on GitHub"
								variant="primary"
								icon={<Icon icon={Star} size="sm" />}
								onClick={handleStar}
							/>
						</HStack>
					</LayoutFooter>
				}
			/>
		</Dialog>
	);
}
