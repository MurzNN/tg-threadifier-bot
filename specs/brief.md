# Brief — Threadifier Bot

## Problem

Many Telegram communities keep a **main chat** (`sourceChat`) with a strict topic. Offtopic posts still appear. Replies pile up — sometimes as reply-chains, sometimes as free-standing messages — before a moderator can intervene.

Today the moderator must:

1. Forward the offtopic root (and related replies) to a **helper chat** (`targetChat`) where digressions are allowed.
2. Preserve them as a coherent **thread**.
3. Delete the clutter from the source chat.
4. Leave a short public note with a link so people continue in the right place.

That work is repetitive, error-prone under load, and easy to do inconsistently.

## Vision

**Threadifier** is a Telegram bot that performs this moderation ritual on demand:

- Trigger: moderator forwards the selected offtopic messages from `sourceChat` into `targetChat`.
- The bot rebuilds a proper thread in the target, removes intermediate/original clutter, and posts a standardized redirect in the source.
- In the target chat, the bot also discourages “floating” messages outside threads by offering to attach them to a recent thread or start a new one.

Later, a lightweight Telegram Mini App (or equivalent in-bot config) lets operators wire which chats are source and target, choose language, and override bot message templates — without touching deployment config for every pair.

## Goals

| Goal | Measure of success |
|------|--------------------|
| Cut moderator busywork | One forward action → full cleanup + thread + notice |
| Preserve context | Target thread includes root quote + subsequent messages in order |
| Keep source clean | Offtopic set deleted; redirect message with deep link remains |
| Keep target structured | Non-threaded messages get an interactive “which thread?” prompt |
| Be operable by non-devs | Chat pairing via bot UI / Mini App |
| Be verifiable | Core flows covered by E2E tests on Telegram Test DCs |
| Be multilingual-ready | All default bot templates and Mini App UI via [Lingui](https://lingui.dev/); catalogs for English, Spanish, French, and Russian |
| Configurable templates | Operators override bot message templates in the Mini App; same placeholders; fallback to translated defaults |
| Minimize custom code | Prefer existing open-source libraries over reinventing wheels; keep owned surface small |
| Optional AI thread titles | Opt-in short titles/topics via LLM; truncate message text when AI is off or fails |

## Goals for future versions

- Automatic offtopic detection (NLP/ML)
- Silent/background moderation without a moderator forward
- Replacing human judgment about *what* is offtopic
- Full forum-topic management beyond the documented thread/link behavior
- Additional UI languages beyond the initial locale set

## Actors

- **Moderator** — selects and forwards offtopic messages; relies on the bot for the rest.
- **Regular member** — may post offtopic (source) or continue discussion (target); may hit the “pick a thread” UX in the target.
- **Operator / admin** — installs the bot, grants rights, links `sourceChat` ↔ `targetChat`, and may customize locales / message templates.

## Environment (product model)

| Chat | Role |
|------|------|
| `sourceChat` | Primary discussion; offtopic discouraged |
| `targetChat` | Helper chat (or later: several topic-specific helpers) for relocated threads |

One bot instance may eventually serve multiple pairs; v1 can start with a single configured pair.

## Success narrative

A digression starts in the main chat. The moderator forwards the offending cluster to the helper chat. Within seconds the helper has a labeled thread with a shareable link, the main chat shows only a polite redirect, and conversation continues in the right place — without the moderator hand-copying messages or hunting for message IDs.
