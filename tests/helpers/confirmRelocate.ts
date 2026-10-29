import type { Bot } from "grammy";

import { TARGET_CHAT_ID } from "./flowA.js";
import type { ApiCall } from "./botApiStub.js";

type KeyboardButton = { text?: string; callback_data?: string };

let nextUpdateId = 5_000;

function buttonsOf(call: ApiCall): KeyboardButton[] {
  const markup = call.payload.reply_markup as
    | { inline_keyboard?: KeyboardButton[][] }
    | undefined;
  return markup?.inline_keyboard?.flat() ?? [];
}

export function relocateCallbacks(calls: ApiCall[], action: string): string[] {
  const found: string[] = [];
  for (const call of calls) {
    if (call.method !== "sendMessage") continue;
    for (const button of buttonsOf(call)) {
      const data = button.callback_data ?? "";
      if (action === "pick" ? data.startsWith("reloc:pick:") : data.startsWith(`reloc:${action}:`)) {
        found.push(data);
      }
    }
  }
  return found;
}

export async function pressRelocate(
  bot: Bot,
  calls: ApiCall[],
  action: "new" | "title" | "attach" | "drop" | "pick",
  options?: { moderatorId?: number; data?: string },
): Promise<void> {
  const data = options?.data ?? relocateCallbacks(calls, action).at(-1);
  if (!data) throw new Error(`no reloc:${action} button`);
  const moderatorId = options?.moderatorId ?? 7;
  nextUpdateId += 1;
  await bot.handleUpdate({
    update_id: nextUpdateId,
    callback_query: {
      id: `cb-${nextUpdateId}`,
      from: { id: moderatorId, is_bot: false, first_name: "Mod" },
      chat_instance: "test",
      data,
      message: {
        message_id: 1,
        date: 1_700_000_900,
        chat: { id: TARGET_CHAT_ID, type: "supergroup", title: "Helper" },
        text: "confirm",
      },
    },
  });
}

export async function pressEveryRelocate(
  bot: Bot,
  calls: ApiCall[],
  action: "new" | "title" | "attach" | "drop" | "pick",
  options?: { moderatorId?: number },
): Promise<void> {
  const datas = relocateCallbacks(calls, action);
  for (const data of datas) {
    await pressRelocate(bot, calls, action, { ...options, data });
  }
}
