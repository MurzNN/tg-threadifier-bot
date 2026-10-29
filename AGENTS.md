# Agent instructions — Threadifier Bot

## What this project is

A Telegram bot (working name: **Threadifier**) that automates offtopic moderation: moderators forward selected messages from a strict `sourceChat` into a `targetChat`; the bot rebuilds them as a thread, cleans up both chats, and posts a redirect notice in the source.

Primary stack: **TypeScript** + **GrammY** + **Hono** + **Drizzle** + **Lingui**. Testing: Vitest transformers + local Bot API emulator on PRs; **Test DC + mtcute** scenarios for release acceptance.

## Where to look

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Human overview and quickstart |
| [specs/brief.md](specs/brief.md) | Problem, vision, success criteria |
| [specs/workflows.md](specs/workflows.md) | User journeys and bot step sequences |
| [specs/architecture.md](specs/architecture.md) | Stack, constraints, data model, APIs |
| [specs/testing.md](specs/testing.md) | Unit / emulator / Test DC E2E |
| [specs/roadmap.md](specs/roadmap.md) | Milestones and task breakdown |
| [specs/contributing.md](specs/contributing.md) | Conventional Commits, branching, PRs |
| [docs/](docs/) | End-user guide (Starlight → GitHub Pages) |

## Working rules for agents

1. **Read specs before inventing behavior.** Workflows and message templates in `specs/workflows.md` and `specs/architecture.md` are normative.
2. **Reuse open-source libraries** instead of reinventing wheels. Prefer the locked stack in `specs/architecture.md` (GrammY, Hono, Drizzle, Zod, pino, Lingui, Vitest, mtcute for E2E only) over custom code.
3. **Do not invent Telegram Bot API capabilities.** History is not fetchable via Bot API — messages must be persisted locally as they arrive. Thread links follow Telegram deep-link rules (`?thread=`).
4. **Keep the moderator trigger simple:** detection starts when messages **forwarded from `sourceChat`** appear in `targetChat` (match by author, content, timestamps against the local store).
5. **Prefer GrammY idioms** (middleware, conversations/plugins, typed context) over ad-hoc polling wrappers.
6. **All defaults translatable; templates overridable** — no hardcoded bot/Mini App copy; Lingui for defaults + UI; operators may override bot message templates in the Mini App (same `{camelCase}` placeholders). Resolution: override → locale default → `en`. Optional AI titles are opt-in with truncate fallback — never block relocate on AI failure.
7. **Testability first:** scenario IDs in workflows Flow D; PR CI = unit + emulator; release = Test DC E2E. No hard-coded production chat IDs. See `specs/testing.md`.
8. **Config via Mini App / bot UI**, not only env vars — operators link chats, set locale, and edit templates. Mini App is a static React+Vite SPA (no SSR unless roadmap says otherwise).
9. **Git:** Conventional Commits and short-lived branches per `specs/contributing.md`. Releases use **release-it** (changelog + GitHub Release + GHCR image) — prefer `feat`/`fix` when a version bump is intended. Commit only when the user asks; never force-push `main` or skip hooks unless explicitly requested.
10. **No drive-by scope:** stick to the roadmap; extra features stay behind explicit milestones.
11. When changing behavior, update the matching spec (`workflows`, `architecture`, `testing`, or `roadmap`) in the same change set. When changing how members, moderators, or operators use the bot, update the matching pages under `docs/src/content/docs/` as well.

## Slash-command change

Behavior for `/pair`, `/unpair`, and `/status` is [specs/workflows.md](specs/workflows.md) Flow C. Invariants are [specs/architecture.md](specs/architecture.md#operator-commands).

Read only:

- `src/bot/commands/pair.ts`
- `src/db/chatPairs.ts`
- `tests/unit/pair.test.ts`

Defaults unless the task says otherwise:

- Command replies are plain `ctx.reply` text.
- A no-argument read (`/pair`, `/status`) is available to anyone who can send it. `/pair source`, `/pair target`, and `/unpair` stay admin-gated.
- Each `chat_pairs` row is owned by `configured_by_user_id`. Private `/pair` and `/status` list that user's rows. `/unpair` deletes the caller's rows for the current chat. Creating the same source and target as another user is an error and does not change the existing row.

After user-facing copy changes:

1. `nub run i18n:extract` (rewrites `src/locales/{locale}/messages.po` for `en`, `es`, `fr`, `ru`, and the test locale `pseudo`; `@lingui/vite-plugin` compiles those catalogs on import)
2. Extend `tests/unit/pair.test.ts` and run that file
3. Update the Flow C table

Update the architecture configuration sentence or the README operator line only when that sentence would become wrong.

Leave relocate, ingest, `drizzle/*.sql`, and `src/locales/en/messages.po` alone unless the task changes user-facing copy. `src/db/schema.ts` is the schema source of truth unless the task adds a column.

## Out of scope (unless roadmap says otherwise)

- Auto-detecting offtopic with ML/NLP
- Moderating without an explicit forward-to-target trigger
- MTProto user sessions as the **product** runtime (mtcute is for Test DC E2E actors only)
- Local Bot API emulator as the **only** acceptance proof (Test DC remains the release gate)
