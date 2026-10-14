/// <reference types="vite/client" />

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import { Theme } from "@astryxdesign/core";
import { useTheme } from "./hooks/use-theme.ts";
import { Sentry, initSentry } from "./lib/sentry.ts";
import { themeRegistry } from "./themes/index.ts";

initSentry();

function ThemedApp() {
	const { themeName, modePreference } = useTheme();
	const entry = themeRegistry[themeName];
	return (
		<Theme theme={entry.theme} mode={entry.darkOnly ? "dark" : modePreference}>
			<App />
		</Theme>
	);
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");
ReactDOM.createRoot(rootElement).render(
	<React.StrictMode>
		<Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
			<ThemedApp />
		</Sentry.ErrorBoundary>
	</React.StrictMode>,
);
