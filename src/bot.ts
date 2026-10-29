import { Bot, type Context } from "grammy";
import { t } from "@lingui/core/macro";

import { createChatMigrationMiddleware } from "./bot/chatMigration.js";
import { createCommandLocaleMiddleware } from "./bot/commandLocale.js";
import { registerLanguageCommand } from "./bot/commands/language.js";
import { registerPairCommands } from "./bot/commands/pair.js";
import { createUpdateLogMiddleware } from "./bot/diagnostics.js";
import { createIngestMiddleware } from "./bot/ingest.js";
import { RelocationDraftStore } from "./bot/relocate/drafts.js";
import {
  flushRelocate,
  registerRelocate,
  stopRelocate,
} from "./bot/relocate/middleware.js";
import { PairDraftStore } from "./db/chatPairs.js";
import type { AppDb } from "./db/client.js";
import { setUserLocale } from "./db/userSettings.js";
import { resolveLocale } from "./i18n.js";
import type { Logger } from "./logger.js";

export { flushRelocate, stopRelocate };

/** Public operator guide linked from the /start welcome. */
export const operatorGuideUrl = "https://murznn.github.io/tg-threadifier-bot/operators/";

export type BotDeps = {
  token: string;
  logger: Logger;
  db: AppDb;
  pairDrafts?: PairDraftStore;
  /** grammY `client.environment` — `test` for Telegram Test DCs. */
  telegramEnvironment?: "prod" | "test";
  /** Override Bot API root (integration stub). No trailing slash. */
  apiRoot?: string;
  /** Quiet period for multi-forward grouping. Defaults to 2 seconds. */
  batchWindowMs?: number;
};

/** Create a GrammY bot with /start, /language, pair commands, and ingest middleware. */
export function createBot({
  token,
  logger,
  db,
  pairDrafts = new PairDraftStore(),
  telegramEnvironment = "prod",
  apiRoot,
  batchWindowMs,
}: BotDeps): Bot {
  const relocationDrafts = new RelocationDraftStore();
  const bot = new Bot(token, {
    client: {
      environment: telegramEnvironment,
      ...(apiRoot ? { apiRoot } : {}),
    },
  });

  bot.use(createUpdateLogMiddleware(logger));
  bot.use(createChatMigrationMiddleware(db, logger, pairDrafts, relocationDrafts));
  bot.use(createIngestMiddleware(db, logger));
  bot.use(registerRelocate(bot, db, logger, relocationDrafts, batchWindowMs));
  bot.use(createCommandLocaleMiddleware(db));

  bot.command("start", async (ctx: Context) => {
    if (ctx.from) {
      await setUserLocale(db, ctx.from.id, resolveLocale(ctx.from.language_code));
    }
    await ctx.reply(
      t({
        comment: "/start welcome. {operatorGuideUrl} is the public operator setup guide.",
        message: `When moderators forward offtopic from the main chat to the helper chat, I rebuild it as a thread and leave a link behind.

Operators: run /pair source and /pair target in the groups, then check /status.
Guide: ${operatorGuideUrl}`,
      }),
    );
  });

  registerLanguageCommand(bot, db);
  registerPairCommands(bot, db, pairDrafts);

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx.update }, "bot middleware error");
  });

  return bot;
}
