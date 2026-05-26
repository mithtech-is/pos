import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
  },
  resolve: {
    // Point directly at the .ts entry so Vite doesn't auto-pick a stale .js
    // sibling left behind by an earlier compile.
    alias: {
      "@pos/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  server: { port: 5173, strictPort: true },
});
