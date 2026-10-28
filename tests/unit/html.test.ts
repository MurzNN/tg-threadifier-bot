import { describe, expect, it } from "vitest";

import { escapeHtml } from "../../src/lib/html.js";

describe("escapeHtml", () => {
  it("escapes Telegram HTML special characters", () => {
    expect(escapeHtml(`Hello <b> & "x"`)).toBe(
      "Hello &lt;b&gt; &amp; &quot;x&quot;",
    );
  });
});
