import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wails from "@wailsio/runtime/plugins/vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    // `wails3 dev` proxies this Vite server; the port must match
    // WAILS_VITE_PORT (set by the CLI) or the default in the root Taskfile.
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [react(), wails("./bindings"), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 10000,
  },
});
