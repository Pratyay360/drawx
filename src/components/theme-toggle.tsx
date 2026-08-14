import { IconButton } from "@astryxdesign/core/IconButton";
import { Icon } from "@astryxdesign/core/Icon";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/use-theme.ts";

export function ThemeToggle() {
	const { theme, toggleTheme } = useTheme();
	const isDark = theme === "dark";
	const label = isDark ? "Switch to light mode" : "Switch to dark mode";

	return (
		<IconButton
			label={label}
			tooltip={label}
			variant="ghost"
			icon={<Icon icon={isDark ? Sun : Moon} size="sm" />}
			onClick={toggleTheme}
		/>
	);
}
