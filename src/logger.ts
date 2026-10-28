import pino from "pino";

import type { Env } from "./env.js";

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">) {
  const usePretty =
    env.NODE_ENV === "development" || env.NODE_ENV === undefined;
  return pino({
    level: env.LOG_LEVEL,
    ...(usePretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          },
        }
      : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
