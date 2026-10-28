import { Bot, type Context } from "grammy";
import { t } from "@lingui/core/macro";

import { registerPairCommands } from "./bot/commands/pair.js";
import { PairDraftStore } from "./db/chatPairs.js";
import type { AppDb } from "./db/client.js";
import type { Logger } from "./logger.js";

export type BotDeps = {
  token: string;
  logger: Logger;
  db: AppDb;
  pairDrafts?: PairDraftStore;
};

/** Create a GrammY bot with /start and chat-pair operator commands. */
export function createBot({
  token,
  logger,
  db,
  pairDrafts = new PairDraftStore(),
}: BotDeps): Bot {
  const bot = new Bot(token);

  bot.command("start", async (ctx: Context) => {
    await ctx.reply(
      t`Threadifier is online. Admins: /pair source and /pair target in the groups, or set SOURCE_CHAT_ID and TARGET_CHAT_ID. Check /status.`,
    );
  });

  registerPairCommands(bot, db, pairDrafts);

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx.update }, "bot middleware error");
  });

  return bot;
}
