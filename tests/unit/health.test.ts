import { describe, expect, it } from "vitest";

import { createHttpApp } from "../../src/http.js";

describe("HTTP health", () => {
  it("returns ok JSON", async () => {
    const app = createHttpApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      service: "threadifier-bot",
    });
  });
});
