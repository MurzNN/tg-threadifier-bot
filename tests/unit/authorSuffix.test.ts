import { describe, expect, it } from "vitest";

import { appendAuthorSuffix } from "../../src/bot/relocate/authorSuffix.js";
import { renderAuthorSuffix } from "../../src/bot/relocate/templates.js";

describe("appendAuthorSuffix", () => {
  it("appends the author and links the name", () => {
    const result = appendAuthorSuffix({
      body: "reply one",
      authorName: "Grace",
      userId: 8,
      maxLength: 4096,
      entities: [{ type: "bold", offset: 0, length: 5 }],
    });
    expect(result.text).toBe(`reply one\n\n${renderAuthorSuffix("Grace")}`);
    expect(result.entities[0]).toMatchObject({ type: "bold", offset: 0, length: 5 });
    expect(result.entities[1]).toMatchObject({
      type: "text_mention",
      offset: result.text.lastIndexOf("Grace"),
      length: "Grace".length,
      user: { id: 8, is_bot: false },
    });
  });

  it("drops entities that fall in the truncated tail", () => {
    const result = appendAuthorSuffix({
      body: "abcdefghij",
      authorName: "Grace",
      userId: 8,
      maxLength: 12,
      entities: [{ type: "bold", offset: 8, length: 2 }],
    });
    expect(result.text.endsWith(renderAuthorSuffix("Grace"))).toBe(true);
    expect(result.entities.some((entity) => entity.type === "bold")).toBe(false);
    expect(result.entities.some((entity) => entity.type === "text_mention")).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(12);
  });
});
