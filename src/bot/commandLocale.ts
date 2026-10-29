import type { Context, MiddlewareFn } from "grammy";

import { getChatLocale } from "../db/chatSettings.js";
import { getUserLocale } from "../db/userSettings.js";
import type { AppDb } from "../db/client.js";
import { resolveLocale, withLocale, type Locale } from "../i18n.js";
import { isBotCommand } from "./commands/menu.js";

function commandName(ctx: Context): string | undefined {
  const text = ctx.message?.text;
  if (!text?.startsWith("/")) return;
  const token = text.split(/\s/)[0] ?? "";
  const name = token.slice(1).split("@")[0]?.toLowerCase();
  return name || undefined;
}

/**
 * Locale for a command reply in this chat.
 * A chat locale wins. Otherwise `/start` follows the Telegram account language.
 * Other commands use the caller's stored locale, then the account language, then `en`.
 */
export async function localeForCommand(
  db: AppDb,
  ctx: Context,
  command: string | undefined,
): Promise<Locale> {
  if (ctx.chat) {
    const chatLocale = await getChatLocale(db, ctx.chat.id);
    if (chatLocale) return chatLocale;
  }
  if (command === "start") return resolveLocale(ctx.from?.language_code);
  if (ctx.from) {
    const stored = await getUserLocale(db, ctx.from.id);
    if (stored) return stored;
  }
  return resolveLocale(ctx.from?.language_code);
}

/**
 * Apply the caller's language to bot commands only.
 * Relocate resolves each destination chat's locale on its own.
 */
export function createCommandLocaleMiddleware(db: AppDb): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const command = commandName(ctx);
    const languageCallback = ctx.callbackQuery?.data?.startsWith("lang:") ?? false;
    if (!languageCallback && !(command && isBotCommand(command))) {
      await next();
      return;
    }
    const locale = await localeForCommand(db, ctx, command);
    await withLocale(locale, () => next());
  };
}
