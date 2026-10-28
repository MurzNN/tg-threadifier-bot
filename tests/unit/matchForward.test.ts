import { describe, expect, it } from "vitest";

import type { StoredMessage } from "../../src/db/messages.js";
import { matchForward, readForwardOrigin } from "../../src/bot/relocate/match.js";

const SOURCE = -1001234567890;

function stored(partial: Partial<StoredMessage> = {}): StoredMessage {
  return {
    chatId: SOURCE,
    messageId: 10,
    fromUserId: 9,
    date: 1_700_000_100,
    text: "hello",
    caption: null,
    contentFingerprint: "fp",
    replyToMessageId: null,
    forwardOrigin: null,
    raw: null,
    ...partial,
  };
}

describe("readForwardOrigin", () => {
  it("reads a user origin", () => {
    expect(
      readForwardOrigin({
        type: "user",
        date: 10,
        sender_user: { id: 9, first_name: "Ada", last_name: "Lovelace" },
      }),
    ).toMatchObject({
      type: "user",
      date: 10,
      senderUserId: 9,
      authorName: "Ada Lovelace",
    });
  });

  it("reads a channel origin with message id", () => {
    expect(
      readForwardOrigin({
        type: "channel",
        date: 10,
        chat: { id: SOURCE, title: "Main" },
        message_id: 44,
      }),
    ).toMatchObject({
      type: "channel",
      originChatId: SOURCE,
      originMessageId: 44,
    });
  });

  it("rejects unknown shapes", () => {
    expect(readForwardOrigin({ type: "story" })).toBeNull();
    expect(readForwardOrigin(null)).toBeNull();
  });
});

describe("matchForward", () => {
  const origin = readForwardOrigin({
    type: "user",
    date: 1_700_000_100,
    sender_user: { id: 9, first_name: "Ada" },
  });

  it("matches one candidate by author, date, and fingerprint", () => {
    const message = stored();
    const result = matchForward({
      origin,
      sourceChatId: SOURCE,
      fingerprint: "fp",
      exact: undefined,
      candidates: [message],
    });
    expect(result).toEqual({ ok: true, message });
  });

  it("fails when the author differs", () => {
    const result = matchForward({
      origin,
      sourceChatId: SOURCE,
      fingerprint: "fp",
      exact: undefined,
      candidates: [stored({ fromUserId: 3 })],
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("fails closed when several candidates remain", () => {
    const result = matchForward({
      origin,
      sourceChatId: SOURCE,
      fingerprint: "fp",
      exact: undefined,
      candidates: [stored({ messageId: 10 }), stored({ messageId: 11 })],
    });
    expect(result).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("matches a channel forward by message id", () => {
    const message = stored({ messageId: 44 });
    const result = matchForward({
      origin: readForwardOrigin({
        type: "channel",
        date: 1,
        chat: { id: SOURCE, title: "Main" },
        message_id: 44,
      }),
      sourceChatId: SOURCE,
      fingerprint: "ignored",
      exact: message,
      candidates: [],
    });
    expect(result).toEqual({ ok: true, message });
  });

  it("does not match a channel forward from another chat", () => {
    const result = matchForward({
      origin: readForwardOrigin({
        type: "channel",
        date: 1,
        chat: { id: -100999, title: "Other" },
        message_id: 44,
      }),
      sourceChatId: SOURCE,
      fingerprint: "fp",
      exact: stored(),
      candidates: [],
    });
    expect(result).toEqual({ ok: false, reason: "foreign_origin" });
  });

  it("matches a hidden user when the fingerprint and date are unique", () => {
    const message = stored({ fromUserId: 9 });
    const result = matchForward({
      origin: readForwardOrigin({
        type: "hidden_user",
        date: 1_700_000_100,
        sender_user_name: "Ada",
      }),
      sourceChatId: SOURCE,
      fingerprint: "fp",
      exact: undefined,
      candidates: [message],
    });
    expect(result).toEqual({ ok: true, message });
  });
});
