# Testing

Threadifier’s quality bar is **full user scenarios**. Unit and local-emulator integration keep PRs fast; **Telegram Test DC E2E** is the release acceptance gate.

See also: [workflows.md](workflows.md) (Flow D scenario IDs), [architecture.md](architecture.md).

---

## Pyramid

| Layer | Fakes | Proves | CI |
|-------|-------|--------|-----|
| **Unit** — Vitest + grammY **API transformers** | Outgoing Bot API in-process | Handlers, templates, phase logic with injected updates | Every PR |
| **Integration** — Vitest + **local Bot API emulator** + PGlite | HTTP Bot API + simple client injection | Bot ↔ HTTP wiring, multi-step flows, DB jobs — **no Telegram secrets** | Every PR |
| **E2E** — Vitest + grammY `environment: "test"` + **mtcute** `testMode` | Nothing (real Test DC) | Forwards, threads, deep links, rights, real update shapes | Nightly / manual / protected workflow |

- **Everyday PR bar:** unit + integration green.
- **Release bar:** Test DC scenario suite green.
- Shared **scenario IDs** (`A1`, `B1`, …) may have an emulator-depth variant and a Test DC-depth variant — same story, two depths.

---

## Package layout

```
tests/
  unit/           # transformers
  integration/    # local Bot API emulator + PGlite
  e2e/
    smoke.test.ts # live getMe (skipped without secrets)
    harness/      # grammY test env + E2E env helpers
    scenarios/    # (M5) Test DC acceptance (A1, B1, …)
  helpers/        # shared fixtures / scenario IDs
scripts/
  e2e-login.ts    # one-shot mtcute testMode login → session secret
```

`nub run test` includes e2e files; live cases use `it.skipIf(!hasE2eSecrets())`. `nub run test:e2e` runs only `tests/e2e`. Login: `nub add -D @mtcute/node` then `nub run e2e:login`.

---

## Unit (transformers)

- Pass `botInfo` so grammY skips live `getMe`.
- Install an API transformer that records `{ method, payload }` and returns synthetic `{ ok: true, result }`.
- Feed updates via `bot.handleUpdate(...)`.
- Assert call sequences (e.g. `sendMessage` → `forwardMessage` → `deleteMessage`) and the Lingui message. `tests/setup.ts` activates the `pseudo` locale, so the expected text comes from `t` or a render helper rather than a pasted translation.

M0 sample: `tests/unit/start.test.ts` records `sendMessage` for `/start` against the welcome message. `tests/unit/language.test.ts` covers account language on `/start` (`ru`, `es-MX`, unknown → `en`), `/language` stored per chat, and the command menu.

Command handlers: `tests/unit/pair.test.ts`. It uses in-memory PGlite from `createTestDb()` (`tests/helpers/db.ts`), `createBot` with `botInfo` set, an API transformer that records outgoing calls, and `bot.handleUpdate` for group and private updates. Assert `sendMessage` text with the same `t` template the command uses. Cover enabling a pair while another enabled row already owns the same target (siblings must soft-disable). Cover a second user pairing the same source and target (the reply is an error and the row stays) and `/unpair` deleting only the caller's rows. For a slash-command change, run that file before `nub run test`.

Flow A relocate (`tests/unit/relocate.test.ts`) also covers a legacy two-enabled-pairs-on-one-target case: preferred lookup misses, fallback pair matches, job completes. Chat migration (`tests/unit/chatMigration.test.ts`) covers remap collisions that would duplicate `(source, target)`.

---

## Integration (local Bot API emulator)

**Purpose:** exercise the real HTTP Bot API client path and workflow orchestration without Test DC credentials.

**Conventions:**

- Point grammY at the emulator (`apiRoot`) — same idea as Test DC, different URL.
- Flow A uses an in-repo HTTP stub (`tests/helpers/botApiStub.ts`). [telegram-test-api](https://github.com/jehy/telegram-test-api) is a polling-client emulator and does not cover `editMessageText`, `copyMessage` with `reply_parameters`, or `deleteMessages`. Updates are injected with `bot.handleUpdate` (the stub records the Bot API calls the real grammY client makes).
- Use PGlite for the app DB in these tests (same Postgres dialect as prod).
- Scenario-shaped tests (`A1` / `A2` / `A3`): assert the call sequence, HTML/Lingui text, `?thread=` link shape, and DB job phase. They do not prove real Telegram delivery.

**Limitations (do not treat as acceptance):**

- Forward-origin metadata may not match production Telegram.
- Thread / forum deep links and real permission failures are unreliable or absent.
- Cannot replace mtcute-driven user forwards on Test DCs.

---

## E2E (Telegram Test DCs)

### Why Test DCs

- Production and test infrastructures are **fully separate** (accounts, bots, chats do not overlap).
- grammY: `client: { environment: "test" }` → `https://api.telegram.org/bot<token>/test/<method>`.
- Bots cannot act as normal users (and cannot talk to bots). Scenario drivers = **MTProto user clients**: [@mtcute/node](https://mtcute.dev) with `testMode: true`.

### Onboarding

1. Open a test client: [web.telegram.org/?test=1](https://web.telegram.org/?test=1) or Telegram Desktop → Add account → Test server.
2. Register / sign in; open @BotFather **on the test network**; create a bot; copy the token.
3. Create `api_id` / `api_hash` at [my.telegram.org](https://my.telegram.org).
4. Run `scripts/e2e-login.ts` (mtcute `testMode`) once; store session material in secrets.
5. Smoke: grammY `getMe` with test env; mtcute `getMe` on the same DC.

Reserved phones `99966XYYYY` (login code = DC id repeated) exist for disposable logins. Prefer **stable dedicated test accounts** + saved sessions for group/admin scenarios (public test numbers are wiped irregularly).

### Secrets (E2E only — never required for unit/integration CI)

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN` | BotFather token from **Test DC** |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | my.telegram.org app credentials |
| `MTCUTE_SESSION_MODERATOR` | Persisted mtcute session (moderator) |
| `MTCUTE_SESSION_MEMBER` | Optional second user for Flow B |

### Harness roles

| Role | Implementation |
|------|----------------|
| Bot under test | Real app, test-env token, PGlite (or ephemeral Postgres) |
| Moderator | mtcute session A — seed messages, forward source→target, admin |
| Member (optional) | mtcute session B — loose messages + button clicks |
| Chats | Created per run (`threadifier-e2e-${runId}`); bot promoted admin |

**Bot process:** long polling in E2E for simplicity; wait for ready/`getMe`. Webhook + tunnel can come later.

**Fixtures:** unique group titles; store chat ids in scenario context; tear down or abandon (Test DC wipe is eventual). **Never** hard-code production chat ids.

**Assertions:** poll with timeout; helpers such as `expectMessageMatching`, `expectDeleted`, `expectThreadLink`. Prefer stable `en` substrings + link patterns over brittle full HTML dumps.

### Manual A1 (until M5 automation)

Not run in CI. Use a Test DC bot that is an admin in two supergroups (read, post, and delete):

1. `/pair source` in the main chat and `/pair target` in the helper chat.
2. Post a short root and one reply in the source, and give the bot a moment to store them.
3. Forward both into the target as the same user, within a couple of seconds.
4. Expect a confirmation in the helper chat (message count, title, preview, and buttons). Choose **Create new thread**.
5. Expect a header that starts with `Thread:` and contains `?thread=`, the reply copied under that header, the temporary forwards gone, the source messages gone, and a source notice with the same link.
6. Forward a message the bot never stored. It should stay, with a note that nothing was deleted.

Keep the target chat limited to moderators: any forward into it from the linked source asks for confirmation, and confirming starts a relocate.

### Scenario catalog

| ID | Maps to | Emulator depth | Test DC depth (acceptance) |
|----|---------|----------------|----------------------------|
| `A1_relocate_happy` | Flow A | Confirmation, then **Create new thread**; call sequence + DB job completed; truncated `{threadTitle}` | Header + `?thread=` link; replies in thread; temps gone; source cleaned + notice |
| `A2_single_message` | Flow A edge | Same, single message, after confirmation | Header only; deletes + notice |
| `A3_match_failure_safe` | Flow A safety | No delete calls after failed match | **No deletes** on real chats; optional moderator error |
| `A4_ai_title_optional` | Flow A + AI | Mocked LLM success + failure → fallback | Header/notice use AI topic when enabled; truncate when AI fails |
| `B1_loose_pick_thread` | Flow B | Callback → forward/delete recorded | Message in thread; loose + prompt gone |
| `B2_loose_create_thread` | Flow B | Create path recorded | New thread; loose cleaned |
| `C1_pair_config` | Flow C | Config API + DB `chat_pairs` | Pair active; ingest uses pair (API/commands first; Mini App UI automation later) |
| `C2_template_override` | Flow C | Save override; render uses override; reset → Lingui default | Same on Test DC if exercised via API |

Expand later as named scenarios: media/albums, permission failures, concurrent loose messages.

---

## CI policy

| Workflow | Runs |
|----------|------|
| PR | `tests/unit` + `tests/integration` |
| Nightly / manual / release | `tests/e2e` with Test DC secrets |

Do not block every PR on Test DC until the suite is stable. Do not use production DCs for automated tests.

---

## Out of scope (v1 E2E)

- Driving the Mini App inside Telegram WebView (cover Flow C via config API / bot commands first).
- Using the local emulator as the **only** acceptance proof.
- MTProto user sessions in the **product** runtime (E2E actors only).
