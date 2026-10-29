import { describe, expect, it } from "vitest";

import {
  resolveTruncatedTitles,
  THREAD_TITLE_BUTTON_MAX,
  truncateText,
} from "../../src/lib/truncate.js";

describe("truncateText", () => {
  it("returns short strings unchanged", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("collapses whitespace and appends ellipsis", () => {
    expect(truncateText("one   two three four", 12)).toBe("one two thr…");
  });
});

describe("resolveTruncatedTitles", () => {
  it("builds threadTitle and a 12-char button label", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const resolved = resolveTruncatedTitles(long);
    expect(resolved.threadTitle.startsWith("ABCDEFGHIJK")).toBe(true);
    expect(resolved.threadTitle12.length).toBeLessThanOrEqual(
      THREAD_TITLE_BUTTON_MAX,
    );
    expect(resolved.threadTitle12).toBe("ABCDEFGHIJKL");
  });
});
