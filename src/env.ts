import { z } from "zod";

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
     * Postgres URL (`postgres://…`) for Helm/prod, or `file:./path` for local
     * PGlite. Omit → default PGlite at `file:./data/threadifier-pg`.
     */
    DATABASE_URL: z.string().optional(),
    SOURCE_CHAT_ID: z.coerce.number().optional(),
    TARGET_CHAT_ID: z.coerce.number().optional(),
  })
  .superRefine((val, ctx) => {
    const hasSource = val.SOURCE_CHAT_ID != null;
    const hasTarget = val.TARGET_CHAT_ID != null;
    if (hasSource !== hasTarget) {
      ctx.addIssue({
        code: "custom",
        message: "SOURCE_CHAT_ID and TARGET_CHAT_ID must be set together",
        path: hasSource ? ["TARGET_CHAT_ID"] : ["SOURCE_CHAT_ID"],
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
  return result.data;
}
