import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "shared") } },
  test: {
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
