import { Icon } from "@iconify/react";
import { useTheme } from "../hooks/use-theme.ts";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex-1 p-1 rounded"
      style={{ color: "var(--color-text-disabled)" }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Icon icon={isDark ? "lucide:sun" : "lucide:moon"} className="w-4 h-4 mx-auto" />
    </button>
  );
}
