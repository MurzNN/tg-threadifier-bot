import { z } from "zod";

import type { StoredMessage } from "../../db/messages.js";

const personSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

const chatSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  username: z.string().optional(),
});

const forwardOriginSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user"),
    date: z.number(),
    sender_user: personSchema,
  }),
  z.object({
    type: z.literal("hidden_user"),
    date: z.number(),
    sender_user_name: z.string(),
  }),
  z.object({
    type: z.literal("chat"),
    date: z.number(),
    sender_chat: chatSchema,
    author_signature: z.string().optional(),
  }),
  z.object({
    type: z.literal("channel"),
    date: z.number(),
    chat: chatSchema,
    message_id: z.number(),
    author_signature: z.string().optional(),
  }),
]);

export type ForwardOriginInfo = {
  type: "user" | "hidden_user" | "chat" | "channel";
  date: number;
  senderUserId?: number;
  originChatId?: number;
  originMessageId?: number;
  authorName?: string;
};

export type MatchFailureReason =
  | "not_found"
  | "ambiguous"
  | "foreign_origin"
  | "unrecognized_origin";

export type ForwardMatch =
  | { ok: true; message: StoredMessage }
  | { ok: false; reason: MatchFailureReason };

function cleanName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 ? name : undefined;
}

function personName(user: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string | undefined {
  const combined = cleanName(
    [user.first_name, user.last_name].filter(Boolean).join(" "),
  );
  if (combined) return combined;
  if (!user.username) return undefined;
  return user.username.startsWith("@") ? user.username : `@${user.username}`;
}

/** Parse Bot API `forward_origin`. Returns null when the shape is not one we can match. */
export function readForwardOrigin(value: unknown): ForwardOriginInfo | null {
  const parsed = forwardOriginSchema.safeParse(value);
  if (!parsed.success) return null;
  const origin = parsed.data;
  switch (origin.type) {
    case "user":
      return {
        type: "user",
        date: origin.date,
        senderUserId: origin.sender_user.id,
        authorName: personName(origin.sender_user),
      };
    case "hidden_user":
      return {
        type: "hidden_user",
        date: origin.date,
        authorName: cleanName(origin.sender_user_name),
      };
    case "chat":
      return {
        type: "chat",
        date: origin.date,
        originChatId: origin.sender_chat.id,
        authorName:
          cleanName(origin.author_signature) ??
          cleanName(origin.sender_chat.title) ??
          (origin.sender_chat.username
            ? `@${origin.sender_chat.username}`
            : undefined),
      };
    case "channel":
      return {
        type: "channel",
        date: origin.date,
        originChatId: origin.chat.id,
        originMessageId: origin.message_id,
        authorName:
          cleanName(origin.author_signature) ??
          cleanName(origin.chat.title) ??
          (origin.chat.username ? `@${origin.chat.username}` : undefined),
      };
  }
}

/**
 * Resolve one forward to a stored source message.
 * Channel origins require the original message id. Other origins need one
 * candidate with the same fingerprint, the origin's original date, and (when
 * the sender is a known user) the same author.
 */
export function matchForward(input: {
  origin: ForwardOriginInfo | null;
  sourceChatId: number;
  fingerprint: string;
  exact: StoredMessage | undefined;
  candidates: readonly StoredMessage[];
}): ForwardMatch {
  if (!input.origin) return { ok: false, reason: "unrecognized_origin" };
  const origin = input.origin;

  if (origin.type === "channel") {
    if (origin.originChatId !== input.sourceChatId) {
      return { ok: false, reason: "foreign_origin" };
    }
    if (!input.exact) return { ok: false, reason: "not_found" };
    return { ok: true, message: input.exact };
  }

  const matched = input.candidates.filter((row) => {
    if (row.chatId !== input.sourceChatId) return false;
    if (row.date !== origin.date) return false;
    if (row.contentFingerprint !== input.fingerprint) return false;
    if (origin.senderUserId != null && row.fromUserId !== origin.senderUserId) {
      return false;
    }
    return true;
  });

  if (matched.length === 1) return { ok: true, message: matched[0]! };
  if (matched.length === 0) return { ok: false, reason: "not_found" };
  return { ok: false, reason: "ambiguous" };
}
