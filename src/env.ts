import { z } from "zod";

import { expandDatabaseUrl } from "./db/databaseUrl.js";

/**
 * Zod-validated process env. When started via `nub` / `nub run`, `.env` files
 * are loaded automatically; plain `node dist/index.js` expects the host env.
 */
const envSchema = z
  .object({
    BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    /**
     * grammY Bot API environment. `test` → api.telegram.org/.../test/ (Test DC).
     * Default `prod` for normal BotFather tokens.
     */
    TELEGRAM_ENVIRONMENT: z.enum(["prod", "test"]).default("prod"),
    /**
     * Postgres URL (`postgres://…`) for Helm/prod, or `file:./path` for local
     * PGlite. Omit → default PGlite at `file:./data/threadifier-pg`.
     * `${NAME}` is replaced from the same environment (for example
     * `postgresql://app:${DATABASE_PASSWORD}@host:5432/app`).
     */
    DATABASE_URL: z.string().optional(),
    /** Public origin for Mini App / BotFather Web App URL (M4). */
    WEBAPP_URL: z.string().url().optional(),
    SOURCE_CHAT_ID: z.coerce.number().optional(),
    TARGET_CHAT_ID: z.coerce.number().optional(),
    /** Telegram user id stored as the owner of the env-seeded pair. */
    CONFIGURED_BY_USER_ID: z.coerce.number().optional(),
  })
  .superRefine((val, ctx) => {
    const hasSource = val.SOURCE_CHAT_ID != null;
    const hasTarget = val.TARGET_CHAT_ID != null;
    const hasOwner = val.CONFIGURED_BY_USER_ID != null;
    const setCount = [hasSource, hasTarget, hasOwner].filter(Boolean).length;
    if (setCount !== 0 && setCount !== 3) {
      const path = !hasSource
        ? ["SOURCE_CHAT_ID"]
        : !hasTarget
          ? ["TARGET_CHAT_ID"]
          : ["CONFIGURED_BY_USER_ID"];
      ctx.addIssue({
        code: "custom",
        message:
          "SOURCE_CHAT_ID, TARGET_CHAT_ID, and CONFIGURED_BY_USER_ID must be set together",
        path,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: NodeJS.ProcessEnv = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  const databaseUrl = result.data.DATABASE_URL;
  return {
    ...result.data,
    DATABASE_URL:
      databaseUrl == null ? undefined : expandDatabaseUrl(databaseUrl, source),
  };
}
