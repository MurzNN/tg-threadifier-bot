import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";

/**
 * Shared Vite config for the SSR build, vite-node, and Vitest.
 * `@lingui/vite-plugin` compiles imported `.po` catalogs and transforms macros.
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
