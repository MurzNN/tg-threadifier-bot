import { describe, expect, it } from "vitest";

import { loadEnv } from "../../src/env.js";

describe("loadEnv", () => {
  it("parses required BOT_TOKEN and defaults", () => {
    const env = loadEnv({
      BOT_TOKEN: "123:abc",
    });
    expect(env.BOT_TOKEN).toBe("123:abc");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects missing BOT_TOKEN", () => {
    expect(() => loadEnv({})).toThrow(/BOT_TOKEN/);
  });
});
