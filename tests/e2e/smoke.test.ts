import { describe, expect, it } from "vitest";

import { testDcGetMe } from "./harness/bot.js";
import { hasE2eSecrets, loadE2eEnv } from "./harness/env.js";

/**
 * Live Test DC smoke. Skipped unless E2E secrets are present so PR CI stays green.
 * Run manually: BOT_TOKEN=… TELEGRAM_API_ID=… TELEGRAM_API_HASH=… nub run test:e2e
 */
describe("Test DC smoke", () => {
  it.skipIf(!hasE2eSecrets())("grammY getMe on test environment", async () => {
    const env = loadE2eEnv();
    const me = await testDcGetMe(env.BOT_TOKEN);
    expect(me.id).toBeGreaterThan(0);
  });
});
