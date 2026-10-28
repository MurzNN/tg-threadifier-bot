import { Bot, type Context } from "grammy";
import { t } from "@lingui/core/macro";

import type { Logger } from "./logger.js";

export type BotDeps = {
  token: string;
  logger: Logger;
};

/** Create a GrammY bot that answers `/start` with a Lingui default string. */
export function createBot({ token, logger }: BotDeps): Bot {
  const bot = new Bot(token);

  bot.command("start", async (ctx: Context) => {
    await ctx.reply(
      t`Threadifier is online. Operators will link source and target chats in the Mini App.`,
    );
  });

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx.update }, "bot middleware error");
  });

  return bot;
}
