import { expect } from "vitest";

import {
  MESSAGE_TEXT_MAX,
  appendAuthorSuffix,
} from "../../src/bot/relocate/authorSuffix.js";
import {
  renderSourceNotice,
  renderThreadHeader,
} from "../../src/bot/relocate/templates.js";
import { buildUserLink, telegramPrivatePathId } from "../../src/lib/links.js";
import type { ApiCall } from "./botApiStub.js";
import { SOURCE_CHAT_ID, TARGET_CHAT_ID } from "./flowA.js";

export function methodsOf(calls: ApiCall[]): string[] {
  return calls.map((call) => call.method);
}

export function assertHappyRelocate(
  calls: ApiCall[],
  options: {
    title: string;
    copyMessageIds: number[];
    sourceMessageIds: number[];
    triggerMessageIds: number[];
    /** Non-root text replies, in chronological order. Each gains an author suffix. */
    replies?: { body: string; author: string; userId: number }[];
    author?: string;
    userId?: number;
    rootMessageId?: number;
  },
): number {
  const edits = calls.filter((call) => call.method === "editMessageText");
  const headerId = edits[0]?.payload.message_id;
  expect(typeof headerId).toBe("number");
  const link = `https://t.me/c/${telegramPrivatePathId(TARGET_CHAT_ID)}/${headerId}?thread=${headerId}`;
  const sourceLink = `https://t.me/c/${telegramPrivatePathId(SOURCE_CHAT_ID)}/${options.rootMessageId ?? 10}`;
  const userId = options.userId ?? 9;
  const author = options.author ?? "Ada Lovelace";
  const linkToUser = buildUserLink(userId);
  expect(edits[0]?.payload.text).toBe(
    renderThreadHeader({
      threadTitle: options.title,
      linkToUser,
      userDisplayName: author,
      linkToSourceChat: sourceLink,
      sourceChatName: "Main",
      threadLink: link,
    }),
  );
  expect(edits[0]?.payload).toMatchObject({
    chat_id: TARGET_CHAT_ID,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });

  const copies = calls.filter((call) => call.method === "copyMessage");
  expect(copies.map((call) => call.payload.message_id)).toEqual(
    options.copyMessageIds,
  );
  for (const copy of copies) {
    expect(copy.payload).toMatchObject({
      chat_id: TARGET_CHAT_ID,
      from_chat_id: SOURCE_CHAT_ID,
      reply_parameters: { message_id: headerId },
    });
  }

  const replyEdits = calls
    .filter((call) => call.method === "editMessageText")
    .slice(1);
  const replies = options.replies ?? [];
  expect(replyEdits.map((call) => call.payload.text)).toEqual(
    replies.map(
      (reply) =>
        appendAuthorSuffix({
          body: reply.body,
          authorName: reply.author,
          userId: reply.userId,
          maxLength: MESSAGE_TEXT_MAX,
        }).text,
    ),
  );
  for (const [index, reply] of replies.entries()) {
    const entities = replyEdits[index]?.payload.entities as
      | { type?: string; user?: { id?: number } }[]
      | undefined;
    expect(
      entities?.some(
        (entity) => entity.type === "text_mention" && entity.user?.id === reply.userId,
      ),
    ).toBe(true);
  }

  const deletes = calls.filter((call) => call.method === "deleteMessages");
  expect(deletes.map((call) => call.payload)).toEqual([
    { chat_id: TARGET_CHAT_ID, message_ids: options.triggerMessageIds },
    { chat_id: SOURCE_CHAT_ID, message_ids: options.sourceMessageIds },
  ]);

  const notice = calls.filter((call) => call.method === "sendMessage").at(-1);
  expect(notice?.payload).toMatchObject({
    chat_id: SOURCE_CHAT_ID,
    parse_mode: "HTML",
  });
  expect(notice?.payload.text).toBe(
    renderSourceNotice({
      topicLabel: options.title,
      linkToUser,
      userDisplayName: author,
      linkToTargetChatThread: link,
      targetChatName: "Helper",
    }),
  );
  return headerId as number;
}
