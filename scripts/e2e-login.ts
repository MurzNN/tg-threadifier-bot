/**
 * One-shot mtcute Test DC login → print a session string for E2E secrets.
 *
 * Prerequisites:
 *   - `nub add -D @mtcute/node` (or install optional peer)
 *   - TELEGRAM_API_ID / TELEGRAM_API_HASH from https://my.telegram.org
 *   - A Test DC account (web.telegram.org/?test=1 or Desktop → Test server)
 *
 * Usage:
 *   nubx vite-node scripts/e2e-login.ts
 *
 * Disposable test phones: use startTest mode (flag `--test-phone`) for
 * 99966XYYYY-style numbers. Prefer a stable account + saved session for group tests.
 *
 * Store the printed session as MTCUTE_SESSION_MODERATOR (or _MEMBER). Never commit it.
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

async function main() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!Number.isFinite(apiId) || !apiHash) {
    throw new Error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the environment");
  }

  let TelegramClient: typeof import("@mtcute/node").TelegramClient;
  try {
    ({ TelegramClient } = await import("@mtcute/node"));
  } catch {
    throw new Error(
      "@mtcute/node is not installed. Run: nub add -D @mtcute/node",
    );
  }

  const useDisposable = process.argv.includes("--test-phone");
  const tg = new TelegramClient({
    apiId,
    apiHash,
    storage: "e2e-login-session",
    testMode: true,
  });

  const me = useDisposable
    ? await tg.startTest()
    : await (async () => {
        const rl = createInterface({ input, output });
        try {
          return await tg.start({
            phone: () => rl.question("Test DC phone (international format): "),
            code: () => rl.question("Login code: "),
            password: () => rl.question("2FA password (empty if none): "),
          });
        } finally {
          rl.close();
        }
      })();

  const session = await tg.exportSession();
  console.log("\nLogged in as", me.username ?? me.displayName ?? me.id);
  console.log("\n--- MTCUTE_SESSION (secret) ---\n");
  console.log(session);
  console.log("\n--- end ---\n");

  await tg.destroy();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
