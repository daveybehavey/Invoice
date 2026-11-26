import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webDir,
  base: "/v3/",
  plugins: [react()],
  css: {
    postcss: path.resolve(webDir, "postcss.config.cjs")
  },
  build: {
    outDir: path.resolve(webDir, "../public/v3"),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000"
    }
  }
});
