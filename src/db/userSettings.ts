import { eq } from "drizzle-orm";

import { isLocale, type Locale } from "../i18n.js";
import type { AppDb } from "./client.js";
import { userSettings } from "./schema.js";

export async function getUserLocale(
  db: AppDb,
  userId: number,
): Promise<Locale | null> {
  const rows = await db
    .select({ locale: userSettings.locale })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const locale = rows[0]?.locale;
  return isLocale(locale) ? locale : null;
}

/** Update only `locale`, so future columns on the same row stay intact. */
export async function setUserLocale(
  db: AppDb,
  userId: number,
  locale: Locale,
): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, locale })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { locale, updatedAt: new Date() },
    });
}
