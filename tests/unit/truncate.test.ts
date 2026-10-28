import { describe, expect, it } from "vitest";

import {
  resolveTruncatedTitles,
  TOPIC_LABEL_BUTTON_MAX,
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
  it("builds threadTitle, topicLabel, and 12-char button label", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const resolved = resolveTruncatedTitles(long);
    expect(resolved.threadTitle.startsWith("ABCDEFGHIJK")).toBe(true);
    expect(resolved.topicLabel).toBe(resolved.threadTitle);
    expect(resolved.topicLabel12.length).toBeLessThanOrEqual(
      TOPIC_LABEL_BUTTON_MAX,
    );
    expect(resolved.topicLabel12).toBe("ABCDEFGHIJKL");
  });
});
