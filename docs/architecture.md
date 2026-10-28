# Architecture

## Constraints from Telegram

| Constraint | Implication |
|------------|-------------|
| Bot API cannot fetch arbitrary past chat history | Persist messages as updates arrive; matching forwards requires a local store |
| Privacy mode / group settings | Bot must receive the messages it needs to store and act on (disable privacy or grant admin as needed) |
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

- **Local / Test DC default:** [PGlite](https://pglite.dev/) data dir (`file:./data/threadifier-pg` or omit URL)
- **Helm / staging / prod:** real Postgres (`postgres://` / `postgresql://`)
- Same SQL semantics everywhere — no dual SQLite/Postgres schemas. Do **not** run multiple app replicas against a shared PGlite directory (single-writer file).

## Internationalization & templates

### Translatable by default

**All** default bot message templates and Mini App UI strings must be translatable — no hardcoded user-facing copy in TypeScript.

| Surface | Examples |
|---------|----------|
| Bot message templates | Thread header, source redirect notice, Flow B prompt, button labels, errors, `/start` |
| Mini App UI | Labels, buttons, help text, validation errors, template editor |

Defaults ship as **Lingui** catalogs (English first; more locales later). Placeholders use **single braces** and **camelCase**: `{threadTitle}` — see [workflows.md](workflows.md#naming--template-placeholders).

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

- Prefer Lingui macros (`t`, `msg`, `Trans` in the Mini App) for defaults and UI so catalogs stay extractable.
- Keep Telegram HTML (`<a href="...">`, etc.) inside messages; translators and operators must preserve placeholders and tags. Escape user-derived values before interpolation.
- Dynamic parts include `threadTitle`, `topicLabel`, `userDisplayName`, `threadLink`, chat titles.
- Message templates in `workflows.md` are the **English meaning** reference for defaults; Lingui catalogs are the shipped defaults; DB overrides are the per-community runtime customization.
- Resolve locale per chat or per operator setting (exact rule TBD): start with a default locale (e.g. `en`) and a per-pair (or per-chat) override once config exists.
- Ship with at least one complete locale catalog from day one of string introduction; additional languages are a product milestone, not a reason to bypass Lingui early.

### Tooling

- Extract / compile catalogs in the normal build or a dedicated `lingui extract` / `lingui compile` script.
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

- **Ingest middleware:** normalize and upsert every relevant message into the store (source + target).
- **Forward detector:** when messages appear in `targetChat`, decide if they are a moderator-triggered forward batch from the linked `sourceChat`.
- **Relocate workflow:** implement Flow A (header → thread link → re-forward → deletes → source notice) in clear phases.
- **Loose-message workflow:** implement Flow B (prompt + callbacks).
- **Admin / config handlers:** pair chats; health; maybe dry-run flags for Test DC.

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

Indexes: `(chat_id, message_id)` unique; `(target_chat_id, created_at desc)` on threads; lookup helpers for fingerprint + date windows when matching forwards.

### Matching forwarded batches

Because the moderator’s forwards land as **new** messages in `targetChat`, the bot should:

1. Detect that an update is a forward (Telegram forward origin / `forward_from` / `forward_from_chat` style fields as available on Bot API for that message type).
2. Restrict candidates to the linked `sourceChat`.
3. Resolve each forwarded item to a stored source message via **origin metadata when present**, else fallback: same author + close timestamp + content fingerprint.
4. Treat simultaneous or near-simultaneous forwards from the same moderator as one **batch** (grouping window TBD, e.g. same media group / short time delta).
5. Designate the earliest (or explicitly first) message as the **initial** root for the header quote.

If confidence is low, **do not delete**; notify the moderator.

### Relocate phases (safety)

Suggested commit points so failures don’t destroy unrecovered content:

1. **Plan** — resolve batch; persist a `relocation_job` row (`pending`).
2. **Create header** — post header; save `root_message_id`; mark `header_created`.
3. **Populate thread** — forward remaining messages into thread; mark `populated`.
4. **Cleanup target temps** — delete moderator’s trigger forwards; mark `target_cleaned`.
5. **Cleanup source** — delete originals; mark `source_cleaned`.
6. **Announce** — post source notice; mark `completed`.

Jobs stuck mid-state should be inspectable (admin command or logs). Prefer retriable non-destructive phases; never retry blind deletes without idempotency keys.

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
| **Helm chart** | Kubernetes deploy: Deployment/Service/Ingress, secrets for `BOT_TOKEN`, Postgres URL, public Mini App URL, probes/health |

Guidelines:

- One image tag = one releasable version of bot + Mini App together (no split versioning).
- Prefer existing community Helm patterns / chart helpers where they fit; keep values.yaml focused on Telegram token, DB, ingress host, and resource limits.
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

Chat IDs live in `chat_pairs` after pairing. Until M4, operators can also use `/pair`, `/unpair`, `/status` (see [workflows.md](workflows.md) Flow C). Helm values map secrets into the container env.

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
2. Exact forward-origin fields available for channel/group forwards in Bot API version in use
3. Batching window for multi-forward detection
4. Retention / pruning policy for `messages` table
5. Helm chart layout (umbrella vs single chart) and ingress/TLS conventions for the target cluster
6. Which local Bot API emulator to standardize on after evaluating method coverage (`forwardMessage`, `deleteMessage`, callbacks, …)
7. LLM provider / model for optional AI titles (and max token / latency budgets)
8. Header max length and `{topicLabel}` truncation length beyond the Flow B 12-char button rule
