import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DialogHeader } from "@astryxdesign/core/Dialog";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { Copy, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getMcpStatus,
	isTauri,
	type McpStatus,
	setMcpEnabled,
} from "../services/tauri.ts";

interface McpSettingsProps {
	onClose: () => void;
}

const OFFLINE_STATUS: McpStatus = {
	running: false,
	port: 0,
	sse_url: "",
	mcp_url: "",
};

export function McpSettings({ onClose }: McpSettingsProps) {
	const [status, setStatus] = useState<McpStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [isToggling, setIsToggling] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const result = await getMcpStatus();
			if (!cancelled) {
				setStatus(result);
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleToggle = useCallback(async (checked: boolean) => {
		setIsToggling(true);
		setError(null);
		const result = await setMcpEnabled(checked);
		if (result) {
			setStatus(result);
		} else {
			setError("Failed to update the MCP server state");
		}
		setIsToggling(false);
	}, []);

	const handleCopy = useCallback(async (url: string) => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard may be unavailable; ignore.
		}
	}, []);

	if (loading) {
		return (
			<Layout
				header={<DialogHeader title="MCP Server" onOpenChange={onClose} />}
				content={
					<LayoutContent isScrollable={false}>
						<HStack hAlign="center" padding={8}>
							<Icon icon={Loader2} size="lg" />
						</HStack>
					</LayoutContent>
				}
			/>
		);
	}

	const display = status ?? OFFLINE_STATUS;
	const isOn = display.running;

	return (
		<Layout
			header={
				<DialogHeader
					title="MCP Server"
					subtitle="Connect AI tools to your active canvas"
					onOpenChange={onClose}
				/>
			}
			content={
				<LayoutContent padding={4}>
					<VStack gap={4}>
						{error && <Banner status="error" title={error} />}

						<Switch
							label={isOn ? "MCP server running" : "MCP server stopped"}
							description="When on, AI tools can read and modify your active canvas over MCP."
							value={isOn}
							onChange={handleToggle}
							isLoading={isToggling}
							isDisabled={!isTauri()}
						/>

						{isOn && display.mcp_url ? (
							<VStack gap={2}>
								<Text type="label" weight="medium">
									Connect URL
								</Text>
								<HStack justify="between" align="center" gap={2}>
									<Text type="code" maxLines={2}>
										{display.mcp_url}
									</Text>
									<Button
										label={copied ? "Copied" : "Copy"}
										variant="ghost"
										size="sm"
										icon={<Icon icon={Copy} size="sm" />}
										onClick={() => handleCopy(display.mcp_url)}
									/>
								</HStack>
								<Text type="supporting" maxLines={3}>
									Point your MCP client at the URL above. An SSE endpoint is
									also available at {display.sse_url}.
								</Text>
							</VStack>
						) : (
							<Text type="supporting">
								The server is off. Turn it on to get a connect URL.
							</Text>
						)}
					</VStack>
				</LayoutContent>
			}
		/>
	);
}
