import { createServer, type Server } from "node:http";

export type ApiCall = {
  method: string;
  payload: Record<string, unknown>;
};

/**
 * Minimal Bot API HTTP stub for Flow A.
 * grammY's real client posts JSON to `{apiRoot}/bot{token}/{method}`.
 * `telegram-test-api` covers polling clients and an older method set
 * (`sendMessage`, `deleteMessage`, `getMe`) and does not implement
 * `editMessageText`, `copyMessage` reply parameters, or `deleteMessages`.
 */
export async function startBotApiStub(): Promise<{
  apiRoot: string;
  calls: ApiCall[];
  close: () => Promise<void>;
}> {
  const calls: ApiCall[] = [];
  let nextId = 799;
  const server: Server = createServer((req, res) => {
    const method =
      (req.url ?? "").split("?")[0]?.split("/").filter(Boolean).at(-1) ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let payload: Record<string, unknown> = {};
      if (raw) {
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      }
      calls.push({ method, payload });
      let result: unknown = true;
      if (method === "sendMessage") {
        result = {
          message_id: ++nextId,
          date: 1_700_000_900,
          chat: { id: payload.chat_id, type: "supergroup", title: "Chat" },
          text: payload.text,
        };
      } else if (method === "editMessageText") {
        result = {
          message_id: payload.message_id,
          date: 1_700_000_900,
          chat: { id: payload.chat_id, type: "supergroup" },
          text: payload.text,
        };
      } else if (method === "copyMessage" || method === "forwardMessage") {
        result = { message_id: ++nextId };
      } else if (method === "getMe") {
        result = {
          id: 42,
          is_bot: true,
          first_name: "Threadifier",
          username: "threadifier_test_bot",
        };
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, result }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    apiRoot: `http://127.0.0.1:${port}`,
    calls,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
