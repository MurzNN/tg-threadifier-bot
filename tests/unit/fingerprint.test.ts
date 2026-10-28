import { describe, expect, it } from "vitest";

import { contentFingerprint } from "../../src/lib/fingerprint.js";

describe("contentFingerprint", () => {
  it("is stable for the same text", () => {
    expect(contentFingerprint({ text: "hello" })).toBe(
      contentFingerprint({ text: "hello" }),
    );
  });

  it("changes when text changes", () => {
    expect(contentFingerprint({ text: "a" })).not.toBe(
      contentFingerprint({ text: "b" }),
    );
  });

  it("includes sorted media ids", () => {
    const a = contentFingerprint({
      text: "x",
      mediaUniqueIds: ["b", "a"],
    });
    const b = contentFingerprint({
      text: "x",
      mediaUniqueIds: ["a", "b"],
    });
    expect(a).toBe(b);
  });

  it("trims text and caption", () => {
    expect(contentFingerprint({ text: "  hi  " })).toBe(
      contentFingerprint({ text: "hi" }),
    );
  });
});
