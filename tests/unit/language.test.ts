import { t } from "@lingui/core/macro";
import type { ApiCallFn, Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot, operatorGuideUrl } from "../../src/bot.js";
import { publishCommandMenu } from "../../src/bot/commands/menu.js";
import type { DbHandle } from "../../src/db/client.js";
import { getChatLocale } from "../../src/db/chatSettings.js";
import { getUserLocale } from "../../src/db/userSettings.js";
import { localeEndonym } from "../../src/i18n.js";
import { createLogger } from "../../src/logger.js";
import { createTestDb } from "../helpers/db.js";

type OutgoingCall = {
  method: string;
  payload: Record<string, unknown>;
};

const botInfo = {
  id: 42,
  is_bot: true,
  first_name: "Threadifier",
  username: "threadifier_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: true,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
} satisfies UserFromGetMe;

function welcomeText(): string {
  return t({
    message: `When moderators forward offtopic from the main chat to the helper chat, I rebuild it as a thread and leave a link behind.

Operators: run /pair source and /pair target in the groups, then check /status.
Guide: ${operatorGuideUrl}`,
  });
}

function noPairsText(): string {
  return t`No chat pairs configured. Run /pair source and /pair target inside the group chats to link.`;
}

function installApiRecorder(bot: Bot): OutgoingCall[] {
  const calls: OutgoingCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
  });
  return calls;
}

function commandUpdate(
  updateId: number,
  text: string,
  languageCode: string | undefined,
  chat: { id: number; type: "private" | "group" },
  userId = 100,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat:
        chat.type === "private"
          ? { id: chat.id, type: "private" as const, first_name: "Mod" }
          : { id: chat.id, type: "group" as const, title: "Group" },
      from: {
        id: userId,
        is_bot: false,
        first_name: "Mod",
        ...(languageCode ? { language_code: languageCode } : {}),
      },
      text,
      entities: [
        {
          offset: 0,
          length: text.indexOf(" ") === -1 ? text.length : text.indexOf(" "),
          type: "bot_command" as const,
        },
      ],
    },
  };
}

function privateCommand(
  updateId: number,
  text: string,
  languageCode: string | undefined,
  userId = 100,
) {
  return commandUpdate(updateId, text, languageCode, { id: userId, type: "private" }, userId);
}

describe("command language", () => {
  let bot: Bot;
  let calls: OutgoingCall[];
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({ token: "test:token", logger, db: handle.db });
    bot.botInfo = botInfo;
    calls = installApiRecorder(bot);
    await bot.init();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("stores en and replies in English when the account language is missing or unknown", async () => {
    await bot.handleUpdate(privateCommand(1, "/start", undefined));
    await bot.handleUpdate(privateCommand(2, "/start", "de"));

    expect(calls.map((call) => call.payload.text)).toEqual([welcomeText(), welcomeText()]);
    expect(await getUserLocale(handle.db, 100)).toBe("en");
  });

  it("stores a shipped account language on /start, including region tags", async () => {
    await bot.handleUpdate(privateCommand(1, "/start", "ru"));
    expect(calls[0]?.payload.text).toBe(welcomeText());
    expect(await getUserLocale(handle.db, 100)).toBe("ru");

    calls.length = 0;
    await bot.handleUpdate(privateCommand(2, "/start", "es-MX", 200));
    expect(calls[0]?.payload.text).toBe(welcomeText());
    expect(await getUserLocale(handle.db, 200)).toBe("es");
  });

  it("keeps a different language in each chat and falls back to the user", async () => {
    await bot.handleUpdate(privateCommand(1, "/language fr", "en"));
    const languageName = localeEndonym("fr");
    expect(calls.at(-1)?.payload.text).toBe(t`Language set to ${languageName}.`);
    expect(await getChatLocale(handle.db, 100)).toBe("fr");
    expect(await getUserLocale(handle.db, 100)).toBeNull();

    calls.length = 0;
    await bot.handleUpdate(privateCommand(2, "/pair", "en"));
    expect(calls[0]?.payload.text).toBe(noPairsText());

    calls.length = 0;
    await bot.handleUpdate(
      commandUpdate(3, "/language es", "en", { id: -200, type: "group" }),
    );
    expect(await getChatLocale(handle.db, -200)).toBe("es");
    expect(await getChatLocale(handle.db, 100)).toBe("fr");

    calls.length = 0;
    await bot.handleUpdate(privateCommand(4, "/start", "ru"));
    expect(calls[0]?.payload.text).toBe(welcomeText());
    expect(await getUserLocale(handle.db, 100)).toBe("ru");
    expect(await getChatLocale(handle.db, 100)).toBe("fr");

    calls.length = 0;
    await bot.handleUpdate(
      commandUpdate(5, "/status", "en", { id: -300, type: "group" }),
    );
    const enabled: unknown[] = [];
    expect(calls[0]?.payload.text).toBe(
      t`This chat is not in an enabled pair. Enabled pairs: ${enabled.length}.`,
    );
  });

  it("shows the language picker and ignores an unknown code", async () => {
    await bot.handleUpdate(privateCommand(1, "/language", "ru"));
    const markup = calls[0]?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
    const languageName = localeEndonym("ru");
    expect(calls[0]?.payload.text).toBe(t`Choose a language. Current: ${languageName}.`);
    expect(markup.inline_keyboard.flat().map((button) => button.callback_data)).toEqual([
      "lang:en",
      "lang:es",
      "lang:fr",
      "lang:ru",
    ]);
    expect(markup.inline_keyboard.flat().find((button) => button.callback_data === "lang:ru")?.text).toMatch(/^✓ /);

    calls.length = 0;
    await bot.handleUpdate(privateCommand(2, "/language de", "ru"));
    expect(calls[0]?.payload.text).toBe(
      t`That language is not available. Choose one of the buttons below.`,
    );
    expect(await getChatLocale(handle.db, 100)).toBeNull();
    expect(await getUserLocale(handle.db, 100)).toBeNull();
  });

  it("stores the language chosen from a button", async () => {
    await bot.handleUpdate({
      update_id: 1,
      callback_query: {
        id: "cb1",
        from: { id: 100, is_bot: false, first_name: "Mod", language_code: "en" },
        chat_instance: "1",
        data: "lang:es",
        message: {
          message_id: 11,
          date: 1_700_000_000,
          chat: { id: 100, type: "private", first_name: "Mod" },
          text: "Choose a language. Current: English.",
        },
      },
    });

    expect(calls.map((call) => call.method)).toEqual([
      "answerCallbackQuery",
      "editMessageText",
    ]);
    const languageName = localeEndonym("es");
    expect(calls[1]?.payload.text).toBe(t`Language set to ${languageName}.`);
    expect(await getChatLocale(handle.db, 100)).toBe("es");
    expect(await getUserLocale(handle.db, 100)).toBeNull();
  });
});

describe("command menu", () => {
  it("includes language choosing for the default menu and for shipped languages", async () => {
    const calls: Array<{
      commands: Array<{ command: string; description: string }>;
      other?: { language_code?: string; scope?: { type: string } };
    }> = [];
    await publishCommandMenu({
      setMyCommands: async (commands, other) => {
        calls.push({
          commands: commands.map((command) => ({
            command: command.command,
            description: command.description,
          })),
          other,
        });
        return true;
      },
    });

    const names = calls[0]?.commands.map((command) => command.command);
    expect(names).toEqual(["start", "language", "pair", "status", "unpair"]);
    expect(calls[0]?.commands.find((command) => command.command === "language")?.description).toBe(
      t`Choose language`,
    );

    const languageCodes = calls
      .filter((call) => call.other?.scope == null)
      .map((call) => call.other?.language_code ?? "en");
    expect(languageCodes).toEqual(["en", "es", "fr", "ru"]);

    const groupMenus = calls.filter((call) => call.other?.scope?.type === "all_group_chats");
    expect(groupMenus).toHaveLength(4);
    expect(groupMenus.map((call) => call.other?.language_code ?? "en")).toEqual([
      "en",
      "es",
      "fr",
      "ru",
    ]);

    const russian = calls.find(
      (call) => call.other?.language_code === "ru" && call.other.scope == null,
    );
    expect(russian?.commands.find((command) => command.command === "language")?.description).toBe(
      t`Choose language`,
    );
  });
});
