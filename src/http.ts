import { Hono } from "hono";

/** Minimal Hono app: health now; webhook + Mini App land in later milestones. */
export function createHttpApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "tg-threadifier-bot" }));

  return app;
}

export type HttpApp = ReturnType<typeof createHttpApp>;
