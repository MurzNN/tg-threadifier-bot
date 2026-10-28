import { defineConfig } from "drizzle-kit";

import {
  drizzleKitDatabaseUrl,
  isPostgresUrl,
} from "./src/db/databaseUrl.js";

const url = drizzleKitDatabaseUrl();

/** Same engine choice as `createDb`: PGlite file by default, Postgres when `DATABASE_URL` is a postgres URL. */
export default defineConfig(
  isPostgresUrl(url)
    ? {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "postgresql",
        dbCredentials: { url },
      }
    : {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "postgresql",
        driver: "pglite",
        dbCredentials: { url },
      },
);
