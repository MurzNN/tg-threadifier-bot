import { AsyncLocalStorage } from "node:async_hooks";

import { i18n } from "@lingui/core";

import { messages as enMessages } from "./locales/en/messages.po";
import { messages as esMessages } from "./locales/es/messages.po";
import { messages as frMessages } from "./locales/fr/messages.po";
import { messages as ruMessages } from "./locales/ru/messages.po";

/** Default locale when a chat has no `chat_settings` row. */
export const DEFAULT_LOCALE = "en";

/** Locales shipped with the bot. Order is the language-picker order. */
export const LOCALES = ["en", "es", "fr", "ru"] as const;

export type Locale = (typeof LOCALES)[number];

const catalogs = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  ru: ruMessages,
} as const;

const commandLocale = new AsyncLocalStorage<Locale>();

let activated = false;
let commandLocaleInstalled = false;

export function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

/**
 * Map a Telegram `language_code` (or a picker value) to a shipped locale.
 * Unknown and missing codes fall back to `en`. Region tags use the base language (`es-MX` → `es`).
 */
export function resolveLocale(candidate: string | null | undefined): Locale {
  return matchLocale(candidate) ?? DEFAULT_LOCALE;
}

/** Like {@link resolveLocale}, but unknown codes stay unknown instead of becoming `en`. */
export function matchLocale(candidate: string | null | undefined): Locale | null {
  if (!candidate) return null;
  const base = candidate.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** Language name in that language, for picker buttons (English, Español, Français, Русский). */
export function localeEndonym(locale: Locale): string {
  const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/**
 * Run `fn` so Lingui `t` calls inside it use `locale`.
 * The global active locale stays `en`; each `t` applies this locale only for that call.
 */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return commandLocale.run(locale, fn);
}

/** Load catalogs and activate a locale (idempotent load). */
export function setupI18n(locale: string = DEFAULT_LOCALE): typeof i18n {
  if (!activated) {
    i18n.load(catalogs);
    activated = true;
  }
  i18n.activate(isLocale(locale) ? locale : DEFAULT_LOCALE);
  installCommandLocale();
  return i18n;
}

function installCommandLocale(): void {
  if (commandLocaleInstalled) return;
  commandLocaleInstalled = true;
  const translate = i18n._.bind(i18n);
  i18n._ = ((...args: Parameters<typeof translate>) => {
    const locale = commandLocale.getStore();
    if (!locale || locale === i18n.locale) {
      return translate(...args);
    }
    const previous = i18n.locale;
    i18n.activate(locale);
    try {
      return translate(...args);
    } finally {
      if (i18n.locale !== previous) i18n.activate(previous);
    }
  }) as typeof i18n._;
}

export { i18n };
