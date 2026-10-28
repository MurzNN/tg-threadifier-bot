import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["src"],
    },
  ],
  compileNamespace: "ts",
  orderBy: "message",
  fallbackLocales: {
    default: "en",
  },
});
