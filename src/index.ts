import { serve } from "@hono/node-server";

import { createBot } from "./bot.js";
import { createDb } from "./db/client.js";
import { seedChatPairFromEnv } from "./db/seed.js";
import { loadEnv } from "./env.js";
import { createHttpApp } from "./http.js";
import { setupI18n } from "./i18n.js";
import { createLogger } from "./logger.js";

async function main() {
  const env = loadEnv();
  const logger = createLogger(env);
  setupI18n();

  const { db, close } = await createDb(env);
  await seedChatPairFromEnv(db, env, logger);

  const app = createHttpApp();
  const bot = createBot({ token: env.BOT_TOKEN, logger, db });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port }, "http listening");
  });

  bot.start({
    onStart: (me) => {
      logger.info({ username: me.username, id: me.id }, "bot started (long polling)");
    },
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    bot.stop();
    await close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
