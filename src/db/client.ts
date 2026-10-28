import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Env } from "../env.js";
import { DEFAULT_DATABASE_URL, isPostgresUrl } from "./databaseUrl.js";
import { schema } from "./schema.js";

const MIGRATIONS_FOLDER = "drizzle";

/** Query surface is the same for PGlite and postgres-js under one schema. */
export type AppDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type DbHandle = {
  db: AppDb;
  /** Close underlying clients (tests / graceful shutdown). */
  close: () => Promise<void>;
};

export { isPostgresUrl } from "./databaseUrl.js";

/** Local default: file-backed PGlite. Prod/Helm: postgres:// URL. */
export async function createDb(env: Env): Promise<DbHandle> {
  if (isPostgresUrl(env.DATABASE_URL)) {
    const client = postgres(env.DATABASE_URL!, { max: 4 });
    const db = drizzlePg(client, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return {
      db,
      close: async () => {
        await client.end({ timeout: 5 });
      },
    };
  }

  const url = env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const client =
    url === "memory://" || url === ":memory:"
      ? new PGlite()
      : (() => {
          const dataDir = pglitePathFromUrl(url);
          mkdirSync(dirname(dataDir), { recursive: true });
          return new PGlite(dataDir);
        })();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

function pglitePathFromUrl(url: string): string {
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url;
}
