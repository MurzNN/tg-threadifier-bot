import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "es", "fr", "ru", "pseudo"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["src"],
    },
  ],
  orderBy: "message",
  pseudoLocale: { locale: "pseudo" },
  fallbackLocales: {
    default: "en",
    pseudo: "en",
  },
  format: formatter({ lineNumbers: false }),
});
