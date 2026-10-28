/** Local PGlite directory when `DATABASE_URL` is omitted. */
export const DEFAULT_DATABASE_URL = "file:./data/threadifier-pg";

export function isPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Database Drizzle Kit should open. An in-memory URL has no files to share
 * with Studio, so that case uses the on-disk default.
 */
export function drizzleKitDatabaseUrl(
  source: string | undefined = process.env.DATABASE_URL,
): string {
  if (!source || source === "memory://" || source === ":memory:") {
    return DEFAULT_DATABASE_URL;
  }
  return source;
}
