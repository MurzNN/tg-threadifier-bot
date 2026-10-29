import { i18n } from "@lingui/core";

import { messages as enMessages } from "./locales/en/messages.po";
import { messages as esMessages } from "./locales/es/messages.po";
import { messages as frMessages } from "./locales/fr/messages.po";
import { messages as ruMessages } from "./locales/ru/messages.po";

/** Default locale; per-pair locale comes later with Mini App config. */
export const DEFAULT_LOCALE = "en";

const catalogs = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
  ru: ruMessages,
} as const;

let activated = false;

/** Load catalogs and activate a locale (idempotent load). */
export function setupI18n(locale: string = DEFAULT_LOCALE): typeof i18n {
  if (!activated) {
    i18n.load(catalogs);
    activated = true;
  }
  i18n.activate(locale);
  return i18n;
}

export { i18n };
