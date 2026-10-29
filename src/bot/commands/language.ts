import { t } from "@lingui/core/macro";
import { InlineKeyboard, type Bot, type Context } from "grammy";

import { localeForCommand } from "../commandLocale.js";
import { setChatLocale } from "../../db/chatSettings.js";
import type { AppDb } from "../../db/client.js";
import {
  LOCALES,
  localeEndonym,
  matchLocale,
  withLocale,
  type Locale,
} from "../../i18n.js";

function languageKeyboard(current: Locale): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const [index, locale] of LOCALES.entries()) {
    const mark = locale === current ? "✓ " : "";
    keyboard.text(`${mark}${localeEndonym(locale)}`, `lang:${locale}`);
    if (index % 2 === 1 && index < LOCALES.length - 1) keyboard.row();
  }
  return keyboard;
}

function chooseLanguageText(current: Locale): string {
  const languageName = localeEndonym(current);
  return t({
    comment:
      "Reply to /language. {languageName} is the current bot language's own name, such as English or Français.",
    message: `Choose a language. Current: ${languageName}.`,
  });
}

function languageSetText(locale: Locale): string {
  const languageName = localeEndonym(locale);
  return t({
    comment:
      "Confirmation after the user picks a bot language. {languageName} is that language's own name, such as Español.",
    message: `Language set to ${languageName}.`,
  });
}

async function currentLocale(ctx: Context, db: AppDb): Promise<Locale> {
  return localeForCommand(db, ctx, "language");
}

async function replyWithPicker(ctx: Context, current: Locale): Promise<void> {
  await ctx.reply(chooseLanguageText(current), {
    reply_markup: languageKeyboard(current),
  });
}

async function confirmLanguage(
  ctx: Context,
  db: AppDb,
  chatId: number,
  locale: Locale,
): Promise<void> {
  await setChatLocale(db, chatId, locale);
  const text = withLocale(locale, () => languageSetText(locale));
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { reply_markup: new InlineKeyboard() });
    return;
  }
  await ctx.reply(text);
}

export function registerLanguageCommand(bot: Bot, db: AppDb): void {
  bot.command("language", async (ctx) => {
    if (!ctx.chat) return;
    const requested = (ctx.match ?? "").trim();
    const current = await currentLocale(ctx, db);
    if (!requested) {
      await replyWithPicker(ctx, current);
      return;
    }
    const locale = matchLocale(requested);
    if (!locale) {
      await ctx.reply(
        t`That language is not available. Choose one of the buttons below.`,
        { reply_markup: languageKeyboard(current) },
      );
      return;
    }
    await confirmLanguage(ctx, db, ctx.chat.id, locale);
  });

  bot.callbackQuery(/^lang:(.+)$/, async (ctx) => {
    if (!ctx.chat) return;
    const locale = matchLocale(ctx.match[1]);
    if (!locale) {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        t`That language is not available. Choose one of the buttons below.`,
        { reply_markup: languageKeyboard(await currentLocale(ctx, db)) },
      );
      return;
    }
    await confirmLanguage(ctx, db, ctx.chat.id, locale);
  });
}
