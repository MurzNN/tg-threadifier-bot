import { i18n } from "@lingui/core";

import { messages as enMessages } from "./locales/en/messages.po";

/** Default locale for M0; per-pair locale comes later with Mini App config. */
export const DEFAULT_LOCALE = "en";

let activated = false;

/** Load catalogs and activate the default locale (idempotent). */
export function setupI18n(locale: string = DEFAULT_LOCALE): typeof i18n {
  if (!activated) {
    i18n.load(DEFAULT_LOCALE, enMessages);
    activated = true;
  }
  i18n.activate(locale);
  return i18n;
}

export { i18n };
