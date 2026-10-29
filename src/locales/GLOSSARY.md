# Translation glossary

Preferred lemmas for Lingui catalogs. These are suggestions: inflect the lemma for case, number, and gender in the target language. The glossary does not list every form.

Command names (`/pair`, `/unpair`) and placeholders (`{threadTitle}`) stay as written in the source. English `msgid`s are not rewritten to match a translation.

Locales with no suggestion for a term are unset. Do not invent a preferred lemma for them here.

## thread

A Telegram reply thread in the helper chat (`?thread=`). This is not a forum topic.

| Locale | Preferred lemma | Avoid |
|--------|-----------------|-------|
| ru | ветка | тред and its other case forms (треда, треду, треды, …) |

## pair

One linked main chat and helper chat (`chat_pairs`).

| Locale | Preferred lemma | Avoid |
|--------|-----------------|-------|
| ru | связка | пара, пары, пару, паре, парах, and the other forms of that word, for this concept |
