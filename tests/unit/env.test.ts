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
    expect(env.TELEGRAM_ENVIRONMENT).toBe("prod");
  });

  it("accepts TELEGRAM_ENVIRONMENT=test", () => {
    const env = loadEnv({
      BOT_TOKEN: "123:abc",
      TELEGRAM_ENVIRONMENT: "test",
    });
    expect(env.TELEGRAM_ENVIRONMENT).toBe("test");
  });

  it("rejects missing BOT_TOKEN", () => {
    expect(() => loadEnv({})).toThrow(/BOT_TOKEN/);
  });
});
