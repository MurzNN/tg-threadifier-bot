import { eq } from "drizzle-orm";

import { DEFAULT_LOCALE, isLocale, type Locale } from "../i18n.js";
import type { AppDb } from "./client.js";
import { chatSettings } from "./schema.js";

export async function getChatLocale(
  db: AppDb,
  chatId: number,
): Promise<Locale | null> {
  const rows = await db
    .select({ locale: chatSettings.locale })
    .from(chatSettings)
    .where(eq(chatSettings.chatId, chatId))
    .limit(1);
  const locale = rows[0]?.locale;
  return isLocale(locale) ? locale : null;
}

/** Command and relocate language for messages posted in this chat. */
export async function localeForChat(db: AppDb, chatId: number): Promise<Locale> {
  return (await getChatLocale(db, chatId)) ?? DEFAULT_LOCALE;
}

/** Update only `locale`, so future columns on the same row stay intact. */
export async function setChatLocale(
  db: AppDb,
  chatId: number,
  locale: Locale,
): Promise<void> {
  await db
    .insert(chatSettings)
    .values({ chatId, locale })
    .onConflictDoUpdate({
      target: chatSettings.chatId,
      set: { locale, updatedAt: new Date() },
    });
}
