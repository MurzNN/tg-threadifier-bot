import { z } from "zod";

/** Secrets required only for Test DC E2E (never for unit/integration CI). */
export const e2eEnvSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  TELEGRAM_API_ID: z.coerce.number().int().positive(),
  TELEGRAM_API_HASH: z.string().min(1),
  MTCUTE_SESSION_MODERATOR: z.string().min(1).optional(),
  MTCUTE_SESSION_MEMBER: z.string().min(1).optional(),
});

export type E2eEnv = z.infer<typeof e2eEnvSchema>;

export function loadE2eEnv(
  source: NodeJS.ProcessEnv = process.env,
): E2eEnv {
  const result = e2eEnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid E2E environment: ${details}`);
  }
  return result.data;
}

/** True when enough secrets exist to attempt a live Test DC smoke. */
export function hasE2eSecrets(source: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(source.BOT_TOKEN && source.TELEGRAM_API_ID && source.TELEGRAM_API_HASH);
}
