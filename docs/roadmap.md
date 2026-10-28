# Roadmap

Granular milestones. Order is dependency-aware; checkboxes are for tracking implementation progress.

---

## M0 — Documentation & project skeleton ✅

- [x] Capture problem, workflows, architecture, roadmap, testing, contributing
- [x] Add agent entrypoint (`AGENTS.md`) and human `README.md`
- [x] Base `package.json`, Vitest smoke test, Dockerfile placeholder entrypoint
- [x] GitHub Actions CI (`test`) + Release (`release-it` changelog/tag + GHCR image)
- [x] Scaffold TypeScript + GrammY + Hono project (lint, tsconfig, real bot entry)
- [x] Wire [Lingui](https://lingui.dev/) (extract/compile scripts, default `en` catalog); `/start` via `t` macro
- [x] Expand Vitest beyond smoke (GrammY API transformer sample)
- [x] Zod env schema + [pino](https://getpino.io/) logging baseline
- [x] `.env.example`, empty bot entry that answers `/start`

**Exit:** Repo runnable as a no-op bot with docs as SSOT.

---

## M1 — Persistence & ingest ✅

- [x] Drizzle schema + Kit migrations for `messages`, `chat_pairs`, `threads` (+ optional `relocation_jobs`)
- [x] Postgres dialect boot: PGlite (local default) + Postgres URL (Helm/prod)
- [x] GrammY middleware: upsert messages from configured chats
- [x] Remap stored chat ids on group → supergroup upgrade (`migrate_to_chat_id` / `migrate_from_chat_id`)
- [x] Temporary chat-pair config until Mini App: **env seed** (`SOURCE_CHAT_ID` / `TARGET_CHAT_ID`) **and** operator slash commands (`/pair`, `/unpair`, `/status`) that persist to `chat_pairs`
- [x] Unit tests for fingerprint / truncation helpers
- [x] Integration scaffold: PGlite persistence smoke (Bot API emulator HTTP wiring deferred to M2 Flow A scenarios)

**Exit:** Bot online in two chats stores every message it sees; unit + PGlite smoke pass in CI.

---

## M1.5 — Packaging for manual testing ✅

Moved earlier so Flow A/B work can be exercised on a real cluster / Test DC without waiting for Mini App.

- [x] Dockerfile for the single app image (bot; Mini App assets later in M4)
- [x] Helm chart via [bjw-s app-template / common](https://bjw-s-labs.github.io/helm-charts/docs/app-template/) (token, **Postgres**, ingress/Mini App URL, probes)
- [x] Test DC E2E harness scaffold: grammY `environment: "test"` + mtcute `testMode` (+ `scripts/e2e-login.ts`)

**Exit:** `helm install` deploys the bot against Postgres; developers can smoke Test DC login/getMe.

---

## M2 — Flow A core (relocate)

- [x] Detect forwards into `targetChat` and match to stored `sourceChat` messages
- [x] Batch grouping for multi-forward / media groups
- [x] Post thread header with HTML / Lingui template
- [x] Build and embed thread deep link (`?thread=`)
- [x] Forward remaining messages into the thread
- [x] Delete trigger forwards in target
- [x] Delete originals in source
- [x] Post source redirect notice
- [x] Phase/job state machine with safe abort on match failure
- [x] Title resolution without AI (truncate message text → `{threadTitle}` / `{topicLabel}`)
- [x] Integration scenarios: `A1` / `A2` / `A3` (emulator depth)
- [ ] Manual Test DC walkthrough for `A1` green (steps in [testing.md](testing.md#manual-a1-until-m5-automation); not run in CI)

**Exit:** Moderator forward → full relocate + notice; emulator scenarios + manual Test DC happy path.

---

## M3 — Flow B (no loose messages in target)

- [ ] Detect non-threaded messages in `targetChat` (exclude bot/system/Flow A traffic)
- [ ] Reply with inline keyboard: Create + last 5 thread labels (12-char rule)
- [ ] Callback: attach to existing thread → forward + delete loose + delete prompt
- [ ] Callback: create new thread → header/thread + cleanup
- [ ] Author-only (or documented) callback policy
- [ ] Integration scenarios: `B1` / `B2` (emulator depth)
- [ ] Manual Test DC for Flow B

**Exit:** Top-level chatter in target is steered into threads interactively.

---

## M4 — Operator configuration (Mini App)

- [ ] Hono serves Vite React SPA (static) + config API in the same process
- [ ] Minimal Mini App UI: select/confirm source & target (no SSR); UI strings via Lingui
- [ ] Backend validation of WebApp `initData` (Zod)
- [ ] Persist `chat_pairs`; remove reliance on hard-coded env pair for normal ops
- [ ] Message template override UI + API (`message_template_overrides`); placeholder validation; reset to defaults
- [ ] Render path: override → locale default → `en` default
- [ ] Confirmation messages / `/status` for operators
- [ ] Integration / API-level `C1_pair_config` (+ template override smoke)
- [ ] Document required bot admin rights in README
- [ ] Image build includes Mini App static assets

**Exit:** Non-dev admin can link chats and customize bot templates without redeploying.

---

## M5 — Hardening & E2E automation

- [ ] Automated scenarios `A1`–`A3`, `B1`–`B2`, `C1` green on Test DC (`A4` when AI lands)
- [ ] CI: PR = unit + emulator integration; nightly/protected = E2E
- [ ] Idempotent retries / stuck-job inspection command
- [ ] Media, albums, empty-caption, long-text edge cases (named scenarios)
- [ ] Retention/pruning policy for `messages`
- [ ] README quickstart filled with real commands (local + Helm)

**Exit:** **Release bar** = Test DC scenario suite green; packaging already landed in M1.5.

---

## M6 — Stretch (explicitly later)

- [ ] Optional AI thread titles (pluggable LLM; scenario `A4`; fallback already in M2)
- [ ] Multiple target chats / topic-specific helpers per source
- [ ] Multi-tenant hosting (many unrelated communities on one deployment)
- [ ] Moderator “preview / confirm” before deletes
- [ ] Additional Lingui locales (beyond initial `en`) + per-chat/pair locale setting UX (overrides remain per locale)
- [ ] Metrics dashboard
- [ ] Mini App UI automation inside Telegram WebView (if still needed beyond `C1` API tests)

Do not start M6 items until M2–M5 priorities are met unless product urgency says otherwise.

---

## Suggested first implementation slice

**M2 relocate is in the tree** (emulator `A1`–`A3`). The remaining M2 gate is a manual Test DC `A1`. Flow B (M3) is next.
