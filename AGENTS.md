# Agent instructions — Threadifier Bot

## What this project is

A Telegram bot (working name: **Threadifier**) that automates offtopic moderation: moderators forward selected messages from a strict `sourceChat` into a `targetChat`; the bot rebuilds them as a thread, cleans up both chats, and posts a redirect notice in the source.

Primary stack: **TypeScript** + **GrammY** + **Hono** + **Drizzle** + **Lingui**. Testing: Vitest transformers + local Bot API emulator on PRs; **Test DC + mtcute** scenarios for release acceptance.

## Where to look

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Human overview and quickstart |
| [docs/brief.md](docs/brief.md) | Problem, vision, success criteria |
| [docs/workflows.md](docs/workflows.md) | User journeys and bot step sequences |
| [docs/architecture.md](docs/architecture.md) | Stack, constraints, data model, APIs |
| [docs/testing.md](docs/testing.md) | Unit / emulator / Test DC E2E |
| [docs/roadmap.md](docs/roadmap.md) | Milestones and task breakdown |
| [docs/contributing.md](docs/contributing.md) | Conventional Commits, branching, PRs |

## Working rules for agents

1. **Read docs before inventing behavior.** Workflows and message templates in `docs/workflows.md` and `docs/architecture.md` are normative.
2. **Reuse open-source libraries** instead of reinventing wheels. Prefer the locked stack in `docs/architecture.md` (GrammY, Hono, Drizzle, Zod, pino, Lingui, Vitest, mtcute for E2E only) over custom code.
3. **Do not invent Telegram Bot API capabilities.** History is not fetchable via Bot API — messages must be persisted locally as they arrive. Thread links follow Telegram deep-link rules (`?thread=`).
4. **Keep the moderator trigger simple:** detection starts when messages **forwarded from `sourceChat`** appear in `targetChat` (match by author, content, timestamps against the local store).
5. **Prefer GrammY idioms** (middleware, conversations/plugins, typed context) over ad-hoc polling wrappers.
6. **All defaults translatable; templates overridable** — no hardcoded bot/Mini App copy; Lingui for defaults + UI; operators may override bot message templates in the Mini App (same `{camelCase}` placeholders). Resolution: override → locale default → `en`. Optional AI titles are opt-in with truncate fallback — never block relocate on AI failure.
7. **Testability first:** scenario IDs in workflows Flow D; PR CI = unit + emulator; release = Test DC E2E. No hard-coded production chat IDs. See `docs/testing.md`.
8. **Config via Mini App / bot UI**, not only env vars — operators link chats, set locale, and edit templates. Mini App is a static React+Vite SPA (no SSR unless roadmap says otherwise).
9. **Git:** Conventional Commits and short-lived branches per `docs/contributing.md`. Commit only when the user asks; never force-push `main` or skip hooks unless explicitly requested.
10. **No drive-by scope:** stick to the roadmap; extra features stay behind explicit milestones.
11. When changing behavior, update the matching doc (`workflows`, `architecture`, `testing`, or `roadmap`) in the same change set.

## Out of scope (unless roadmap says otherwise)

- Auto-detecting offtopic with ML/NLP
- Moderating without an explicit forward-to-target trigger
- MTProto user sessions as the **product** runtime (mtcute is for Test DC E2E actors only)
- Local Bot API emulator as the **only** acceptance proof (Test DC remains the release gate)
