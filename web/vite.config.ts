import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = path.resolve(import.meta.dirname);
const repo = path.resolve(import.meta.dirname, "..");

const base = (process.env.OFD_BASE ?? "").replace(/\/+$/, "");

export default defineConfig({
  root,
  base: `${base}/`,
  plugins: [react()],
  resolve: { alias: { "@shared": path.join(repo, "shared") } },
  server: {
    port: Number(process.env.PORT) || 5180,
    strictPort: true,
    fs: { allow: [repo] },
    proxy: { "/api": { target: `http://localhost:${process.env.OFD_API_PORT || 8787}`, changeOrigin: false } },
  },
  build: { outDir: path.join(repo, "dist", "web"), emptyOutDir: true },
});
