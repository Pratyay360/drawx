// Compatibility shim — new source of truth is src/hooks/use-theme.ts.
// Keeps `useThemeStore(selector)` working for any legacy call sites.

import {
	type ColorMode,
	type ModePreference,
	useTheme,
} from "../hooks/use-theme.ts";
import type { ThemeName } from "../themes/index.ts";

export type Theme = ColorMode;

/**
 * Zustand-compatible wrapper around the new external-store hook.
 * Supports `useThemeStore(s => s.theme)` and `useThemeStore.getState()` patterns
 * in a minimal way for legacy code.
 */
export function useThemeStore<T>(
	selector?: (state: ThemeStoreState) => T,
): T | ThemeStoreState {
	const {
		theme,
		setTheme,
		toggleTheme,
		themeName,
		modePreference,
		mode,
		setThemeName,
		setMode,
		toggleMode,
	} = useTheme();

	const state: ThemeStoreState = {
		theme,
		setTheme,
		toggleTheme,
		themeName,
		modePreference,
		mode,
		setThemeName,
		setMode,
		toggleMode,
	};

	if (typeof selector === "function") return selector(state);
	return state as unknown as T;
}

// Provide getState for imperative uses (e.g. canvas title save logic that might read store directly)
useThemeStore.getState = () => {
	// This is intentionally not reactive — callers reading via getState are expected to handle staleness.
	// We delegate to localStorage-derived snapshot to avoid requiring React context.

	const raw = localStorage.getItem("drawx-theme");
	const fallback = raw === "light" || raw === "dark" ? raw : "light";
	return { theme: fallback };
};

useThemeStore.setState = () => {
	// No-op: state is now managed by the external store in hooks/use-theme.ts
};

type ThemeStoreState = {
	theme: Theme;
	setTheme: (next: Theme) => void;
	toggleTheme: () => void;
	// Extended fields from new theming system
	themeName: ThemeName;
	modePreference: ModePreference;
	mode: Theme;
	setThemeName: (name: ThemeName) => void;
	setMode: (mode: ModePreference) => void;
	toggleMode: () => void;
};
