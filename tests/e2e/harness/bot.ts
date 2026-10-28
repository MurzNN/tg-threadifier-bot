import { Api } from "grammy";

/**
 * Smoke helper: grammY `getMe` against Telegram Test DCs.
 * Requires `BOT_TOKEN` from BotFather on the **test** network.
 */
export async function testDcGetMe(token: string): Promise<{ id: number; username?: string }> {
  const api = new Api(token, { environment: "test" });
  const me = await api.getMe();
  return { id: me.id, username: me.username };
}
