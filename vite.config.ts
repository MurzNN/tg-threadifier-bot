import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";

/**
 * Shared Vite config: Lingui macro transform for SSR build, vite-node, and Vitest.
 */
export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
        format: "esm",
      },
    },
  },
  ssr: {
    noExternal: ["@lingui/core"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
