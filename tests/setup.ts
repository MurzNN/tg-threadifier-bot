import { i18n, setupI18n } from "../src/i18n.js";
import { messages as pseudoMessages } from "../src/locales/pseudo/messages.po";

setupI18n();
i18n.load("pseudo", pseudoMessages);
i18n.activate("pseudo");

// `withLocale` switches the active catalog while a command runs. Tests stay on `pseudo`.
const translate = Object.getPrototypeOf(i18n)._.bind(i18n) as typeof i18n._;
i18n._ = translate;
