import { createDb, type AppDb, type DbHandle } from "../../src/db/client.js";

/** Ephemeral in-memory PGlite for unit/integration tests. */
export async function createTestDb(): Promise<DbHandle> {
  return createDb({
    BOT_TOKEN: "test:token",
    PORT: 3000,
    LOG_LEVEL: "silent",
    TELEGRAM_ENVIRONMENT: "prod",
    NODE_ENV: "test",
    DATABASE_URL: "memory://",
  });
}

export type { AppDb };
