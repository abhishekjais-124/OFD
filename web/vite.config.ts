import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = path.resolve(import.meta.dirname);
const repo = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: { "@shared": path.join(repo, "shared") } },
  server: {
    port: 5173,
    fs: { allow: [repo] },
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
  build: { outDir: path.join(repo, "dist", "web"), emptyOutDir: true },
  test: {},
});
