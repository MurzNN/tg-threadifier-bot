import { serve } from "@hono/node-server";

import { createBot, flushRelocate } from "./bot.js";
import { publishCommandMenu } from "./bot/commands/menu.js";
import { logPollingReady } from "./bot/diagnostics.js";
import { createDb } from "./db/client.js";
import { listEnabledPairs } from "./db/chatPairs.js";
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
  const bot = createBot({
    token: env.BOT_TOKEN,
    logger,
    db,
    telegramEnvironment: env.TELEGRAM_ENVIRONMENT,
  });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port }, "http listening");
  });

  bot.start({
    onStart: async (me) => {
      try {
        await publishCommandMenu(bot.api);
      } catch (err) {
        logger.error({ err }, "failed to publish the command menu");
      }
      logPollingReady(logger, me, await listEnabledPairs(db), env.DATABASE_URL);
    },
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    try {
      await flushRelocate(bot);
    } catch (err) {
      logger.error({ err }, "relocate flush on shutdown failed");
    }
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
