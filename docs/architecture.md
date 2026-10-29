# Architecture

## Constraints from Telegram

| Constraint | Implication |
|------------|-------------|
| Bot API cannot fetch arbitrary past chat history | Persist messages as updates arrive; matching forwards requires a local store |
| Privacy mode / group settings | Bot must receive the messages it needs to store and act on (disable privacy or grant admin as needed) |
| Group → supergroup upgrade changes the chat id | On `migrate_to_chat_id` / `migrate_from_chat_id`, rewrite the old id to the new one in `chat_pairs`, `messages`, `threads`, open `relocation_jobs` payloads, and in-memory `/pair` drafts |
| Deletes and forwards need rights | Bot must be admin (or equivalently privileged) in source and target |
| Thread deep links | Use `https://t.me/{chatPath}/{messageId}?thread={messageId}` after creating the header message ([docs](https://core.telegram.org/api/links)) |
| HTML in messages | Use Telegram HTML subset for user/chat links in templates |

Do **not** rely on userbot / MTProto user sessions for the **product runtime**. MTProto clients (mtcute) are used only as **Test DC E2E actors**.

## Engineering principles

**Prefer existing open-source libraries** over custom implementations. Reuse maintained packages for bot plumbing, persistence, i18n, testing, and common utilities whenever they fit the stack — the goal is to minimize the amount of proprietary code we have to manage and support. Invent in-house solutions only for product-specific workflow logic that libraries do not cover well.

## Naming conventions

| Layer | Style | Examples |
|-------|-------|----------|
| Docs, TypeScript, Lingui placeholders | **camelCase** | `sourceChat`, `threadTitle`, `{topicLabel}`, `{linkToUser}` |
| SQL tables / columns | **snake_case** | `chat_pairs`, `source_chat_id`, `thread_title` |

Drizzle schema properties use camelCase in TypeScript and map to snake_case columns. Do not mix styles in the same layer (e.g. avoid `{link_to_sourceChat}`).

## Preferred stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript (JavaScript only if a thin glue script is unavoidable) |
| Runtime | Node.js (LTS) |
| Tooling | [Nub](https://nubjs.com/) — installs (`nub.lock`), script runner, TS file runner; Docker via `ghcr.io/nubjs/nub` |
| Bot framework | [GrammY](https://grammy.dev/) (+ official plugins: auto-retry, parse-mode, hydrate, menu/keyboards as needed) |
| HTTP | [Hono](https://hono.dev/) — webhook, health, static Mini App, config API |
| i18n | [Lingui](https://lingui.dev/) only (no `@grammyjs/i18n` alongside it) |
| Persistence | [Drizzle ORM](https://orm.drizzle.team/) + Drizzle Kit |
| DB dialect | **PostgreSQL only** (one schema / one migration tree) |
| Drivers | Local/Test DC: [PGlite](https://pglite.dev/) (in-process Postgres); Helm/prod: `postgres` (via Drizzle) |
| Validation | [Zod](https://zod.dev/) (env, API bodies, `initData` helpers) |
| Logging | [pino](https://getpino.io/) |
| Mini App UI | React + Vite — **static SPA** (no SSR for v1) |
| Packaging | Single deployable app (bot backend + Mini App assets) |
| Deployment | Docker image + Helm chart (Postgres in cluster) |
| Unit tests | [Vitest](https://vitest.dev/) + grammY API transformers |
| Integration tests | Vitest + local Bot API emulator + PGlite |
| Acceptance E2E | Telegram **Test DCs** + [@mtcute/node](https://mtcute.dev) user clients |
| Optional AI titles | Pluggable LLM client (provider TBD) — **opt-in**; truncate fallback always |

## Libraries & reuse

| Concern | Use | Avoid reinventing |
|---------|-----|-------------------|
| Bot updates / API | GrammY + official plugins | Custom polling loops, ad-hoc HTTP to Bot API |
| HTTP + static | Hono | Separate Mini App microservice |
| Schema / SQL | Drizzle + Kit migrations | Hand-rolled SQL string piles without types |
| Env / payloads | Zod | Ad-hoc `process.env` checks scattered everywhere |
| Logs | pino | `console.log` as the production logger |
| i18n | Lingui (`{camelCase}` ICU placeholders) | Hardcoded strings, `{{mustache}}`, snake_case placeholders, or a second i18n stack |
| Optional AI titles | Existing SDK for chosen provider (OpenAI-compatible, etc.) | Homegrown HTTP + prompt framework |
| Unit Bot API | grammY transformers | One-off mock objects per test without shared helpers |
| Integration Bot API | Local emulator (e.g. [telegram-test-api](https://github.com/jehy/telegram-test-api) or maintained equivalent) | Hitting production Telegram from PR CI |
| E2E user actions | mtcute (`testMode: true`) | Driving acceptance only via Bot API |

## Persistence (PostgreSQL dialect)

One TypeScript `pg-core` schema and one Drizzle Kit migration tree. Engine selected at boot from `DATABASE_URL`:

- **Local / Test DC default:** [PGlite](https://pglite.dev/) data dir (`file:./data/threadifier-pg` or omit URL). `nub run db:studio` opens that same database (a `postgres://` URL when `DATABASE_URL` is one).
- **Helm / staging / prod:** real Postgres (`postgres://` / `postgresql://`)
- Same SQL semantics everywhere — no dual SQLite/Postgres schemas. Do **not** run multiple app replicas against a shared PGlite directory (single-writer file).

## Internationalization & templates

### Translatable by default

**All** default bot message templates and Mini App UI strings must be translatable — no hardcoded user-facing copy in TypeScript.

| Surface | Examples |
|---------|----------|
| Bot message templates | Thread header, source redirect notice, Flow B prompt, button labels, errors, `/start` |
| Mini App UI | Labels, buttons, help text, validation errors, template editor |

Defaults ship as **Lingui** catalogs (`en`, `es`, `fr`, `ru`). Placeholders use **single braces** and **camelCase**: `{threadTitle}` — see [workflows.md](workflows.md#naming--template-placeholders).

### Operator overrides (configurable templates)

Operators must be able to **override** default message templates in the Mini App (per `chat_pairs` / community), without a redeploy:

- Editable templates include at least: thread header, source redirect notice, Flow B prompt text, and related button label strings where product-useful.
- Overrides keep the same `{placeholder}` contract; the UI should list allowed placeholders and validate that required ones remain present.
- Telegram HTML in overrides is allowed within the same subset as defaults; sanitize / validate on save.
- **Resolution order** when rendering a message: operator override for the active locale (if any) → Lingui default for that locale → English Lingui default.
- Clearing an override restores the built-in (translated) default.
- Mini App UI chrome itself stays Lingui-driven (translated); only bot **message templates** are operator-overridable unless we later expose more keys.

Store overrides in the DB (e.g. `message_template_overrides`: `chat_pair_id`, `templateKey`, `locale`, `body`). Do not invent a second i18n framework for overrides — interpolate with the same placeholder rules as Lingui/ICU-style `{name}`.

### Conventions

- Prefer Lingui macros (`t`, `msg`, `Trans` in the Mini App) for defaults and UI so catalogs stay extractable. Put each reply sentence in one `t` template, including state words such as "enabled", so translators do not receive concatenated fragments.
- Keep Telegram HTML (`<a href="...">`, etc.) inside messages; translators and operators must preserve placeholders and tags. Escape user-derived values before interpolation.
- Dynamic parts include `threadTitle`, `topicLabel`, `userDisplayName`, `threadLink`, chat titles.
- Message templates in `workflows.md` are the **English meaning** reference for defaults; Lingui catalogs are the shipped defaults; DB overrides are the per-community runtime customization.
- Command replies (`/start`, `/language`, `/pair`, `/status`, `/unpair`) use this chat's locale, then the calling user's locale, then the account language, then `en`. `/language` stores the choice on `chat_settings` (one row per chat; further settings are additional columns) and is not admin-gated. `/start` stores Telegram `language_code` on `user_settings` when it is `en`, `es`, `fr`, or `ru` (region tags use the base language, so `es-MX` is `es`); any other code stores `en`. That user row is the fallback for chats with no locale of their own, and `/start` does not replace a chat's `/language` choice. A chat that already has a locale keeps it for the `/start` reply.
- Relocate messages use the locale of the chat they are posted in, then `en`. The thread header, match and abort notices, and author suffixes use the target chat. The source notice uses the source chat. A user's private fallback does not apply.
- Ship with at least one complete locale catalog from day one of string introduction; additional languages are a product milestone, not a reason to bypass Lingui early.

### Tooling

- User-facing defaults use the `t` macro from `@lingui/core/macro`. After adding or changing a `t` string, run `nub run i18n:extract` (rewrites `src/locales/{locale}/messages.po` for `en`, `es`, `fr`, and `ru`). `@lingui/vite-plugin` compiles those `.po` catalogs when they are imported (`src/i18n.ts`); there is no `lingui compile` step and no generated `messages.ts`.
- `tests/setup.ts` calls `setupI18n()`. Unit tests assert English substrings of the rendered reply.
- Unit-test critical messages with a fixed locale to lock placeholder wiring (links, truncation labels).
- Unit/integration tests for override resolution (override wins; missing override falls back; invalid placeholder rejected on save).

## High-level components

One process / one container runs both the Telegram bot backend and the Mini App (static assets + config API). No separate Mini App service.

```
┌─────────────────┐     updates      ┌─────────────────────────────────┐
│  Telegram API   │ ───────────────► │  Single app (Node)              │
└─────────────────┘                  │  ┌─────────────────────────────┐│
         ▲                           │  │ GrammY bot                  ││
         │ actions                   │  │  - routers / middleware     ││
         └───────────────────────────│  │  - workflows                ││
                                     │  └─────────────────────────────┘│
                                     │  ┌─────────────────────────────┐│
                     HTTPS ◄─────────│  │ Hono: Mini App + config API ││
                                     │  │  - static Vite SPA          ││
                                     │  │  - initData-validated API   ││
                                     │  │  - webhook + health         ││
                                     │  └─────────────────────────────┘│
                                     └────────────────┬────────────────┘
                                                      │
                                     ┌────────────────▼────────────────┐
                                     │  Drizzle → PGlite or Postgres   │
                                     │  messages / chat_pairs / threads│
                                     └─────────────────────────────────┘
```

### Bot app (GrammY)

- **Ingest middleware:** normalize and upsert every relevant message into the store (source + target). At `debug`, each update and each ingest decision (stored, no message, chat outside an enabled pair) is logged. Startup logs `canReadAllGroupMessages`, the watched chat ids, and the database target, and warns when privacy mode hides ordinary group messages.
- **Chat migration middleware:** when Telegram upgrades a basic group to a supergroup, remaps the old chat id to the new one across persisted pair/message/thread/job state (and `/pair` drafts) so ingest and relocate keep working. Colliding remaps soft-disable the remapped pair instead of duplicating an existing `(source, target)`.
- **Forward detector:** when messages appear in `targetChat`, decide if they are a moderator-triggered forward batch from the linked `sourceChat`.
- **Relocate workflow:** implement Flow A (header → thread link → re-forward → deletes → source notice) in clear phases.
- **Loose-message workflow:** implement Flow B (prompt + callbacks).
- **Admin / config handlers:** pair chats; health; maybe dry-run flags for Test DC. See [Operator commands](#operator-commands). Command replies use the caller's language (`/language`, and the account language on `/start`).
- **Command menu:** on startup, `setMyCommands` publishes `start`, `language`, `pair`, `status`, and `unpair` for private chats and all group chats. The menu with no `language_code` is English. `es`, `fr`, and `ru` each get a menu in that language.

### Message store

Minimal fields to support matching and UI:

**`messages`**

| Field | Notes |
|-------|-------|
| `chat_id` | Telegram chat id |
| `message_id` | Telegram message id |
| `from_user_id` | Author |
| `date` | Unix time from Telegram |
| `text` / `caption` | For content match and labels |
| `content_fingerprint` | Optional hash of text + media file unique ids |
| `reply_to_message_id` | Preserve topology when useful |
| `forward_origin` | If Telegram provides origin metadata on the update |
| `raw` | Optional JSON of stripped update for debugging |
| `created_at` | When we stored it |

**`chat_pairs`**

| Field | Notes |
|-------|-------|
| `id` | Internal |
| `source_chat_id` | |
| `target_chat_id` | |
| `source_title` / `target_title` | Cached display names |
| `source_username_or_path` | For deep links when public |
| `ai_titles_enabled` | Optional; default false; TS: `aiTitlesEnabled` |
| `enabled` | Soft disable |

#### Operator commands

Handlers live in `src/bot/commands/pair.ts`. Persistence lives in `src/db/chatPairs.ts`. Normative behavior is [workflows.md](workflows.md) Flow C.

- Replies are plain text (`ctx.reply`, no `parse_mode`). Telegram HTML and `escapeHtml` are for relocate templates (`src/bot/relocate/templates.ts`).
- `requireChatAdmin` (`src/bot/admin.ts`) treats a private chat as allowed and, in a group, requires Telegram status `creator` or `administrator`. `/pair` with no arguments and `/status` do not call it. `/pair source`, `/pair target`, and `/unpair` do.
- Rows are not owned by the operator who created them. The table has no configuring-user column.
- Upsert identity is `(source_chat_id, target_chat_id)`. One chat may appear in more than one row.
- **At most one enabled pair per `target_chat_id`.** Enabling a pair (via `/pair`, env seed, or upsert) soft-disables every other enabled row that shares that target. Lookup prefers the newest pair id (`ORDER BY id DESC`).
- Relocate still defends against legacy duplicate enabled targets: it tries each enabled pair for the target until a full batch match succeeds, and logs a warning when more than one enabled pair exists or when a non-preferred pair wins.
- Group → supergroup remaps that would collide with an existing `(source, target)` row soft-disable the remapped row and keep the existing one.
- `/unpair` sets `enabled=false` and leaves the row. A list of all pairs includes disabled rows and rows seeded from `SOURCE_CHAT_ID` / `TARGET_CHAT_ID`.
- An in-progress `/pair source` then `/pair target` lives in the in-memory `PairDraftStore`, keyed by the operator's Telegram user id. The row is written when both chats are set.

**`threads`**

| Field | Notes |
|-------|-------|
| `id` | Internal |
| `target_chat_id` | |
| `root_message_id` | Header message id (= thread id for links); TS: `rootMessageId` |
| `thread_title` | Resolved header title; TS / Lingui: `threadTitle` / `{threadTitle}` |
| `topic_label` | Notice + Flow B label; TS / Lingui: `topicLabel` / `{topicLabel}` (12-char button: `topicLabel12`) |
| `title_source` | `truncated` \| `ai`; TS: `titleSource` |
| `initiator_user_id` | TS: `initiatorUserId` |
| `created_at` | For “last 5” ordering |

**`user_settings`**

One row per Telegram user. Add further per-user settings as columns; updates touch only the columns they change.

| Field | Notes |
|-------|-------|
| `user_id` | Telegram user id; primary key |
| `locale` | `en`, `es`, `fr`, or `ru` — fallback command language when the chat has none |
| `updated_at` | Last change to the row |

**`chat_settings`**

One row per Telegram chat. Add further per-chat settings as columns; updates touch only the columns they change. A group → supergroup upgrade rewrites `chat_id`. If the new id already has a row, that row is kept and the old one is dropped.

| Field | Notes |
|-------|-------|
| `chat_id` | Telegram chat id; primary key |
| `locale` | `en`, `es`, `fr`, or `ru` — language of command replies in this chat |
| `updated_at` | Last change to the row |

Indexes: `(chat_id, message_id)` unique; `(target_chat_id, created_at desc)` on threads; lookup helpers for fingerprint + date windows when matching forwards.

### Matching forwarded batches

Because the moderator’s forwards land as **new** messages in `targetChat`, the bot:

1. Detects `forward_origin` on a non-bot message in the linked `targetChat` (`user`, `hidden_user`, `chat`, or `channel`).
2. Groups forwards from the same user in that chat into one batch. The quiet period is **2 seconds** (`BATCH_WINDOW_MS`); each new forward resets it, so a media group that arrives together stays one batch.
3. Restricts candidates to the linked `sourceChat` for each enabled pair of that target (newest pair first; warn and try siblings if several remain).
4. Resolves each item:
   - **Channel origin** whose chat is the source: exact `message_id`. A channel origin from any other chat is a failure (not a fuzzy match).
   - **Otherwise:** one stored row with the same content fingerprint, the same `forward_origin.date`, and (when the sender is a known user) the same author.
5. Sorts matches by stored `date`, then message id. The earliest is the header root.

Zero matches or more than one candidate is a match failure: persist `relocation_jobs.phase = aborted`, tell the moderator in the target chat, and **do not delete**. Match-failure logs include `sourceChatId`, origin date, fingerprint, origin type, and candidate count.

### Relocate phases (safety)

Suggested commit points so failures don’t destroy unrecovered content:

1. **Plan** — resolve batch; persist a `relocation_job` row (`pending`).
2. **Create header** — post header; save `root_message_id`; mark `header_created`.
3. **Populate thread** — copy remaining messages into the reply thread; mark `populated`.
4. **Cleanup target temps** — delete moderator’s trigger forwards; mark `target_cleaned`.
5. **Cleanup source** — delete originals; mark `source_cleaned`.
6. **Announce** — post source notice; mark `completed`.

The header is sent and then edited once its id is known, so `{threadLink}` is `https://t.me/{chatPath}/{messageId}?thread={messageId}`. Other messages are placed in that reply thread with `copyMessage` and `reply_parameters` pointing at the header. `forwardMessage` cannot set a reply, and `message_thread_id` applies to forum topics only — Flow A does not create forum topics. A copy is sent by the bot, so text and captions are then edited to append `— {authorName}` (`text_mention` when the sender id is known). Original formatting entities that still fit are kept. Stickers and other non-caption messages stay as the plain copy.

If a Bot API call fails after the plan, the job is marked `aborted` and `payload.stoppedAt` keeps the last committed phase. Deletes that have not run are skipped. The moderator gets a short notice in the target chat. Jobs are rows in `relocation_jobs` (an inspection command is M5). `aiTitlesEnabled` is stored but ignored until M6; titles always use truncation, or the Lingui “Media message” label when the root has no text or caption. A media-only root is not copied into the thread.

### Optional AI thread titles

- **Default path:** no AI — `{threadTitle}` / `{topicLabel}` from root message text with truncation.
- **Opt-in path:** call a pluggable LLM to produce a short topic; on timeout/error, fall back to truncation. Relocate must not fail because AI failed.
- Config: env and/or per-pair flag (`aiTitlesEnabled`); secrets for API keys via Helm — never in git.
- Tests: mock the LLM port in unit/integration; scenario `A4_ai_title_optional` covers success + fallback ([workflows.md](workflows.md) Flow D).
- Provider choice is an open decision; prefer a thin official/SDK client over custom HTTP.

### Mini App (same app)

- Purpose: let an admin pick/link `sourceChat` and `targetChat`, choose locale, and **edit/override bot message templates**.
- **Same deployable** as the bot: Hono serves the Vite-built static SPA and the config API that validates Telegram WebApp `initData`.
- **No SSR for v1** — WebView cold start and the Telegram `WebApp` bridge dominate latency for this small admin UI; a lean SPA is enough. Revisit only if measured load time requires it.
- Writes to `chat_pairs`, `message_template_overrides` (+ maybe invite/deep-link helpers).
- Mini App chrome is fully Lingui-translated; template editor shows default (translated) text and allows saving overrides.

Exact UI is roadmap work; architecture requires validated write paths for pairing and template overrides in-process with the bot.

## Deployment

| Artifact | Role |
|----------|------|
| **Docker image** | Single container packaging the Node app (bot + Mini App static build + migrations entrypoint as designed) |
| **Helm chart** | `charts/tg-threadifier-bot` — [bjw-s common / app-template](https://bjw-s-labs.github.io/helm-charts/docs/app-template/) library; secrets for `BOT_TOKEN` + `DATABASE_URL`; optional in-cluster Postgres; ingress + `WEBAPP_URL` for Mini App; `/health` probes |

Guidelines:

- One image tag = one releasable version of bot + Mini App together (no split versioning).
- Chart depends on `common` 5.3.0 (`oci://ghcr.io/bjw-s-labs/helm`); run `helm dependency build` before install. Values stay focused on token, DB, ingress host, and resources.
- Local/dev may run the app without Kubernetes; Docker remains the canonical runtime shape for staging/prod.
- Helm defaults to **Postgres**; local defaults to **PGlite** (same dialect).

## Configuration (runtime)

Environment (illustrative):

- `BOT_TOKEN` — from BotFather (Test DC token for E2E)
- `DATABASE_URL` — `file:…` (or omit) for local PGlite; `postgres://` / `postgresql://` for real Postgres
- `SOURCE_CHAT_ID` / `TARGET_CHAT_ID` — optional boot seed into `chat_pairs` for local/Test DC (slash commands or Mini App are the operator path)
- `WEBAPP_URL` / public origin — Mini App URL registered with BotFather (same host the app serves)
- `PORT` — HTTP listen port for Mini App + health + webhook
- Optional: `LOG_LEVEL`, feature flags

Chat IDs live in `chat_pairs` after pairing. Until M4, operators can also use `/pair`, `/unpair`, `/status` (see [workflows.md](workflows.md) Flow C). `/pair` with no arguments lists every stored pair in a private chat and reports the current chat's pairing in a group. `/language` sets this chat's command language. `/start` stores the caller's fallback language from the Telegram account when that language is shipped, otherwise `en`. Helm values map secrets into the container env.

## Testing strategy

Full detail: [testing.md](testing.md). Summary:

| Layer | Role | CI |
|-------|------|-----|
| Unit (Vitest + grammY transformers) | Fingerprints, phases, link builders, handlers with injected updates | Every PR |
| Integration (Vitest + local Bot API emulator + PGlite) | HTTP Bot API path, multi-step workflows, DB jobs — no Telegram secrets | Every PR |
| **E2E scenarios (Test DC + mtcute)** | **Main product acceptance** — Flow A/B/C as real users | Nightly / protected workflow with secrets |

- **PR bar:** unit + emulator integration green.
- **Release bar:** Test DC scenario suite green (scenario IDs in [workflows.md](workflows.md) Flow D).
- Emulators accelerate development; they do **not** replace Test DC acceptance.

## Open technical decisions

Record decisions here when closed:

1. ~~SQLite vs Postgres for v1~~ → **Postgres dialect only** (PGlite local; Postgres Helm)
2. ~~Exact forward-origin fields~~ → Bot API `forward_origin` (`user`, `hidden_user`, `chat`, `channel`). Group forwards are usually `user` or `hidden_user` and have no original message id. `channel` carries `chat` + `message_id` and matches exactly when that chat is the linked source. Otherwise: fingerprint + exact origin date + author when the sender is known. Zero or several candidates → no deletes.
3. ~~Batching window~~ → **2 seconds** after the latest forward from the same user in the target chat (`BATCH_WINDOW_MS`).
4. Retention / pruning policy for `messages` table
5. ~~Helm chart layout~~ → single chart under `charts/tg-threadifier-bot` depending on [bjw-s common](https://bjw-s-labs.github.io/helm-charts/docs/app-template/) (app-template library); optional in-chart Postgres StatefulSet; ingress host left to the target cluster
6. ~~Which local Bot API emulator~~ → in-repo HTTP stub (`tests/helpers/botApiStub.ts`) that speaks the Bot API JSON envelope. `telegram-test-api` targets polling clients and does not cover `editMessageText`, `copyMessage` with `reply_parameters`, or `deleteMessages`. Test DC remains the acceptance gate.
7. LLM provider / model for optional AI titles (and max token / latency budgets)
8. ~~Header max length~~ → `{threadTitle}` and `{topicLabel}` share `THREAD_TITLE_MAX` (120). Flow B buttons still shorten `{topicLabel}` to 12 (`TOPIC_LABEL_BUTTON_MAX`).
