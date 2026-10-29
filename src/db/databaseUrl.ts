/** Local PGlite directory when `DATABASE_URL` is omitted. */
export const DEFAULT_DATABASE_URL = "file:./data/threadifier-pg";

/** `${NAME}` — one pass, no default syntax. */
const ENV_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function isPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Replace `${NAME}` in a database URL with values from `source`.
 * Referenced names do not need to be part of the app env schema.
 * An unset name is an error; an empty value is kept.
 */
export function expandDatabaseUrl(
  url: string,
  source: NodeJS.ProcessEnv,
): string {
  return url.replace(ENV_REF, (placeholder, name: string) => {
    const value = source[name];
    if (value == null) {
      throw new Error(
        `Invalid environment: DATABASE_URL: ${placeholder} references unset environment variable ${name}`,
      );
    }
    return value;
  });
}

/**
 * Database Drizzle Kit should open. An in-memory URL has no files to share
 * with Studio, so that case uses the on-disk default.
 */
export function drizzleKitDatabaseUrl(
  source: string | undefined = process.env.DATABASE_URL,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!source || source === "memory://" || source === ":memory:") {
    return DEFAULT_DATABASE_URL;
  }
  return expandDatabaseUrl(source, env);
}
