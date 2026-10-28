import type { Bot } from "grammy";

import { flushRelocate } from "../../src/bot.js";
import { upsertChatPair } from "../../src/db/chatPairs.js";
import type { AppDb } from "../../src/db/client.js";

export const SOURCE_CHAT_ID = -1001234567890;
export const TARGET_CHAT_ID = -1009876543210;

export type Original = {
  messageId: number;
  fromUserId: number;
  date: number;
  text: string | null;
  firstName: string;
  lastName?: string;
};

export const ROOT: Original = {
  messageId: 10,
  fromUserId: 9,
  date: 1_700_000_100,
  text: "offtopic root about widgets",
  firstName: "Ada",
  lastName: "Lovelace",
};

export const REPLY_ONE: Original = {
  messageId: 11,
  fromUserId: 8,
  date: 1_700_000_101,
  text: "reply one",
  firstName: "Grace",
};

export const REPLY_TWO: Original = {
  messageId: 12,
  fromUserId: 9,
  date: 1_700_000_102,
  text: "reply two",
  firstName: "Ada",
  lastName: "Lovelace",
};

export async function seedPair(db: AppDb): Promise<void> {
  await upsertChatPair(db, {
    sourceChatId: SOURCE_CHAT_ID,
    targetChatId: TARGET_CHAT_ID,
    sourceTitle: "Main",
    targetTitle: "Helper",
    enabled: true,
  });
}

function person(original: Pick<Original, "fromUserId" | "firstName" | "lastName">) {
  return {
    id: original.fromUserId,
    is_bot: false as const,
    first_name: original.firstName,
    ...(original.lastName ? { last_name: original.lastName } : {}),
  };
}

export function sourceUpdate(updateId: number, original: Original) {
  return {
    update_id: updateId,
    message: {
      message_id: original.messageId,
      date: original.date,
      chat: {
        id: SOURCE_CHAT_ID,
        type: "supergroup" as const,
        title: "Main",
      },
      from: person(original),
      ...(original.text != null ? { text: original.text } : {}),
    },
  };
}

export function forwardUpdate(
  updateId: number,
  triggerMessageId: number,
  original: Original,
  moderatorId = 7,
) {
  return {
    update_id: updateId,
    message: {
      message_id: triggerMessageId,
      date: 1_700_000_500 + triggerMessageId,
      chat: {
        id: TARGET_CHAT_ID,
        type: "supergroup" as const,
        title: "Helper",
      },
      from: { id: moderatorId, is_bot: false as const, first_name: "Mod" },
      ...(original.text != null ? { text: original.text } : {}),
      forward_origin: {
        type: "user" as const,
        date: original.date,
        sender_user: person(original),
      },
    },
  };
}

/** Store originals via ingest, then deliver moderator forwards. Caller flushes. */
export async function deliverCluster(
  bot: Bot,
  originals: Original[],
  options?: { moderatorId?: number; triggerStart?: number },
): Promise<void> {
  let updateId = 1;
  for (const original of originals) {
    await bot.handleUpdate(sourceUpdate(updateId, original));
    updateId += 1;
  }
  let trigger = options?.triggerStart ?? 201;
  for (const original of originals) {
    await bot.handleUpdate(
      forwardUpdate(updateId, trigger, original, options?.moderatorId ?? 7),
    );
    updateId += 1;
    trigger += 1;
  }
  await flushRelocate(bot);
}
