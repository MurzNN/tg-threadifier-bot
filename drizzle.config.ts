import { defineConfig } from "drizzle-kit";

/** Single PostgreSQL dialect (PGlite locally, Postgres in Helm). */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
