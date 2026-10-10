import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
export default defineConfig(async () => ({
	// GitHub Pages project site lives under /drawx/. Tauri (tauri://localhost)
	// and local dev need "/". The Pages workflow sets GITHUB_PAGES=true.
	base: process.env.GITHUB_PAGES === "true" ? "/drawx/" : "/",
	plugins: [react(), tailwindcss()],
	clearScreen: false,
	resolve: {
		conditions: ["development", "production"],
	},
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			ignored: ["**/src-tauri/**"],
		},
	},
	build: {
		chunkSizeWarningLimit: 10000,
	},
}));
