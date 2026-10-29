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

  it("rejects a partial chat-pair seed", () => {
    expect(() =>
      loadEnv({
        BOT_TOKEN: "123:abc",
        SOURCE_CHAT_ID: "-1001",
        TARGET_CHAT_ID: "-1002",
      }),
    ).toThrow(/CONFIGURED_BY_USER_ID/);
  });

  it("rejects missing BOT_TOKEN", () => {
    expect(() => loadEnv({})).toThrow(/BOT_TOKEN/);
  });

  it("expands ${NAME} references in DATABASE_URL", () => {
    const env = loadEnv({
      BOT_TOKEN: "123:abc",
      DATABASE_PASSWORD: "s3cret",
      DATABASE_URL:
        "postgresql://app:${DATABASE_PASSWORD}@tg-threadifier-bot-test-postgresql:5432/app",
    });
    expect(env.DATABASE_URL).toBe(
      "postgresql://app:s3cret@tg-threadifier-bot-test-postgresql:5432/app",
    );
  });

  it("rejects a DATABASE_URL reference to an unset variable", () => {
    expect(() =>
      loadEnv({
        BOT_TOKEN: "123:abc",
        DATABASE_URL: "postgresql://app:${DATABASE_PASSWORD}@localhost:5432/app",
      }),
    ).toThrow(/DATABASE_PASSWORD/);
  });
});
