import { describe, expect, it } from "vitest";

import {
  buildMessageLink,
  buildThreadLink,
  telegramPrivatePathId,
} from "../../src/lib/links.js";

describe("thread links", () => {
  it("builds the private supergroup form from a -100 chat id", () => {
    expect(telegramPrivatePathId(-1001234567890)).toBe("1234567890");
    expect(
      buildThreadLink({ chatId: -1001234567890, messageId: 5678 }),
    ).toBe("https://t.me/c/1234567890/5678?thread=5678");
  });

  it("uses the public username when the chat has one", () => {
    expect(
      buildThreadLink({
        chatId: -1001234567890,
        messageId: 5678,
        username: "@chat_path",
      }),
    ).toBe("https://t.me/chat_path/5678?thread=5678");
  });

  it("links a source message without the thread query", () => {
    expect(
      buildMessageLink({ chatId: -1001234567890, messageId: 10 }),
    ).toBe("https://t.me/c/1234567890/10");
  });
});
