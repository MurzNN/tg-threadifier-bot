import { z } from "zod";

/**
 * Zod-validated process env. When started via `nub` / `nub run`, `.env` files
 * are loaded automatically; plain `node dist/index.js` expects the host env.
 */
const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
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
