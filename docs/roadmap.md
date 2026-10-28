# Roadmap

Granular milestones. Order is dependency-aware; checkboxes are for tracking implementation progress.

---

## M0 — Documentation & project skeleton ✅ (docs)

- [x] Capture problem, workflows, architecture, roadmap, testing, contributing
- [x] Add agent entrypoint (`AGENTS.md`) and human `README.md`
- [x] Base `package.json`, Vitest smoke test, Dockerfile placeholder entrypoint
- [x] GitHub Actions CI (`test`) + Release (`release-it` changelog/tag + GHCR image)
- [ ] Scaffold TypeScript + GrammY + Hono project (lint, tsconfig, real bot entry)
- [ ] Wire [Lingui](https://lingui.dev/) (extract/compile scripts, default `en` catalog); `/start` via `t` macro
- [ ] Expand Vitest beyond smoke (GrammY API transformer sample)
- [ ] Zod env schema + [pino](https://getpino.io/) logging baseline
- [ ] `.env.example`, empty bot entry that answers `/start`

**Exit:** Repo runnable as a no-op bot with docs as SSOT.

---

## M1 — Persistence & ingest

- [ ] Drizzle schema + Kit migrations for `messages`, `chat_pairs`, `threads` (+ optional `relocation_jobs`)
- [ ] Dual dialect boot: SQLite (local default) + Postgres (URL-driven)
- [ ] GrammY middleware: upsert messages from configured chats
- [ ] Env-based temporary chat pair (until Mini App) for local/Test DC use
- [ ] Unit tests for fingerprint / truncation helpers
- [ ] Integration scaffold: local Bot API emulator + SQLite smoke

**Exit:** Bot online in two chats stores every message it sees; unit + emulator smoke pass in CI.

---

## M2 — Flow A core (relocate)

- [ ] Detect forwards into `targetChat` and match to stored `sourceChat` messages
- [ ] Batch grouping for multi-forward / media groups
- [ ] Post thread header with HTML / Lingui template
- [ ] Build and embed thread deep link (`?thread=`)
- [ ] Forward remaining messages into the thread
- [ ] Delete trigger forwards in target
- [ ] Delete originals in source
- [ ] Post source redirect notice
- [ ] Phase/job state machine with safe abort on match failure
- [ ] Title resolution without AI (truncate message text → `{threadTitle}` / `{topicLabel}`)
- [ ] Integration scenarios: `A1` / `A2` / `A3` (emulator depth)
- [ ] Manual Test DC walkthrough for `A1` green

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

**Exit:** Non-dev admin can link chats and customize bot templates without redeploying.

---

## M5 — Packaging, hardening & E2E automation

- [ ] Dockerfile for the single app image (bot + Mini App assets)
- [ ] Helm chart (token, **Postgres**, ingress/Mini App URL, probes)
- [ ] Test DC E2E harness: grammY `environment: "test"` + mtcute `testMode`
- [ ] `scripts/e2e-login.ts` + documented secrets
- [ ] Automated scenarios `A1`–`A3`, `B1`–`B2`, `C1` green on Test DC (`A4` when AI lands)
- [ ] CI: PR = unit + emulator integration; nightly/protected = E2E
- [ ] Idempotent retries / stuck-job inspection command
- [ ] Media, albums, empty-caption, long-text edge cases (named scenarios)
- [ ] Retention/pruning policy for `messages`
- [ ] README quickstart filled with real commands (local + Helm)

**Exit:** Image + chart deploy a working bot/Mini App; **release bar** = Test DC scenario suite green.

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

Smallest useful demo: **M0 scaffold + M1 ingest + M2 happy path** with text-only messages, env-configured chat pair, Vitest transformers, and emulator-depth `A1`. Mini App, Flow B, and full Test DC automation follow once relocate is trustworthy.
