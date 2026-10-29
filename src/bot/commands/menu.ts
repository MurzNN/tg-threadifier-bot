import { t } from "@lingui/core/macro";
import type { Api } from "grammy";
import type { BotCommand } from "grammy/types";

import { LOCALES, withLocale, type Locale } from "../../i18n.js";

const COMMANDS = ["start", "language", "pair", "status", "unpair"] as const;

export function isBotCommand(name: string): boolean {
  return (COMMANDS as readonly string[]).includes(name);
}

export function commandMenu(locale: Locale): BotCommand[] {
  return withLocale(locale, () => [
    {
      command: "start",
      description: t({
        comment: "Telegram command menu description for /start",
        message: "Show the welcome message",
      }),
    },
    {
      command: "language",
      description: t({
        comment:
          "Telegram command menu description for /language. Opens the bot language picker.",
        message: "Choose language",
      }),
    },
    {
      command: "pair",
      description: t({
        comment:
          "Telegram command menu description for /pair. Links a source chat and a target chat.",
        message: "Link source and target chats",
      }),
    },
    {
      command: "status",
      description: t({
        comment: "Telegram command menu description for /status",
        message: "Show the enabled chat pair",
      }),
    },
    {
      command: "unpair",
      description: t({
        comment:
          "Telegram command menu description for /unpair. Disables the chat pair that includes this chat.",
        message: "Disable the chat pair",
      }),
    },
  ]);
}

type CommandMenuApi = Pick<Api, "setMyCommands">;

/**
 * Publish the command menu in English (default for other account languages)
 * and in each shipped locale, for private chats and for groups.
 */
export async function publishCommandMenu(api: CommandMenuApi): Promise<void> {
  const scopes: Array<{ type: "all_group_chats" } | undefined> = [
    undefined,
    { type: "all_group_chats" },
  ];
  for (const scope of scopes) {
    for (const locale of LOCALES) {
      await api.setMyCommands(commandMenu(locale), {
        ...(scope ? { scope } : {}),
        ...(locale === "en" ? {} : { language_code: locale }),
      });
    }
  }
}
