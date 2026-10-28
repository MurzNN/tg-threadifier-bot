# Workflows

Normative user journeys and bot behavior. Message templates use Telegram `parse_mode: HTML` for markup.

Copy shown below is the **English default** meaning reference. Defaults are **translatable** via **Lingui** catalogs; operators may **override** bot message templates in the Mini App (same placeholders). Do not hardcode templates in TypeScript. See [architecture.md](architecture.md#internationalization--templates).

## Naming & template placeholders

**camelCase** for all product identifiers in docs, TypeScript, and Lingui placeholders: `sourceChat`, `{threadTitle}`, `{linkToUser}`.

| Layer | Convention | Examples |
|-------|------------|----------|
| Docs, TS, Lingui placeholders | **camelCase** | `sourceChat`, `{topicLabel}`, `{userDisplayName}` |
| SQL tables / columns | **snake_case** (DB norm; mapped in Drizzle) | `chat_pairs.source_chat_id` |

Placeholders use **single braces** (ICU / Lingui):

| Style | Verdict |
|-------|---------|
| `{threadTitle}` | **Preferred** |
| `{{threadTitle}}` | Avoid — Mustache; fights Lingui |
| `${threadTitle}` | Avoid in catalogs |

Telegram HTML (`<a href="...">`) is markup inside the message, not a placeholder syntax. Escape user-provided values before interpolation (architecture).

### Title resolution (shared)

Before posting the thread header and source notice, the bot resolves `threadTitle` and `topicLabel` from the root offtopic message:

| Mode | `{threadTitle}` (header) | `{topicLabel}` (source notice + stored label) |
|------|--------------------------|-----------------------------------------------|
| **No AI** (default) | Root message text, truncated to 120 characters | Same truncated text |
| **AI enabled** (optional) | Short AI-generated thread title | Same AI topic (or a slightly longer AI summary if configured); on AI failure → fall back to no-AI row |

- AI is **opt-in** per deployment or per chat pair (config TBD). Core relocate must work with AI off.
- Persist the resolved title on the thread row so Flow B button labels stay stable (`Thread: {topicLabel}` shortened to 12 characters → `{topicLabel12}`).
- Media-only roots (no text): use a fixed Lingui fallback (e.g. “Media message”) or AI vision later — v1 can use a static fallback when AI is off.

---

## Prerequisites (all flows)

- Bot is a member of `sourceChat` and `targetChat` with rights to read, post, forward, and delete messages as required.
- Operator has linked the pair (source ↔ target) in bot config.
- Bot has been storing inbound messages for both chats in the local DB (needed for matching forwards and for recent-thread labels).

---

## Flow A — Relocate offtopic cluster (happy path)

**Actor:** Moderator  
**Trigger:** Moderator selects one or more messages in `sourceChat` and forwards them to `targetChat` (as a single forward or a bundle).

### Steps

1. **Moderator forwards** selected messages from `sourceChat` → `targetChat`.
2. **Bot detects** that the new messages in `targetChat` are forwards originating from the linked `sourceChat`, by matching against the local store (timestamps, authors, content — see architecture).
3. **Bot resolves** `{threadTitle}` / `{topicLabel}` (see Title resolution above).
4. **Bot posts a thread header** in `targetChat` (this message becomes the thread root):

   ```
   Thread: {threadTitle}
   Initiated by the user <a href="{linkToUser}">{userDisplayName}</a> in the chat <a href="{linkToSourceChat}">{sourceChatName}</a>.
   <a href="{threadLink}">Thread link</a>.
   ```

   - `{threadTitle}` — AI short title if enabled, otherwise root message text (truncated as needed).
   - `{linkToUser}` / `{userDisplayName}` — author of that root message.
   - `{linkToSourceChat}` / `{sourceChatName}` — pointer back to the origin chat (and ideally the original message while it still exists).

5. **Bot obtains** the header `messageId` and builds the thread deep link:

   ```
   https://t.me/{chatPath}/{messageId}?thread={messageId}
   ```

   Examples:

   - `https://t.me/c/1234567890/5678?thread=5678` (private / internal link forms as applicable)
   - `https://t.me/chat_path/5678?thread=5678`

   Reference: [Telegram links](https://core.telegram.org/api/links).

6. **Bot forwards** all other messages in the moderated set (excluding the root already represented in the header) **into that thread** in `targetChat`. The header message is the reply-thread root (`?thread=` is that message id). This is not a forum topic. Each copied message keeps its original author as a suffix on the text or caption: `— {authorName}`, linked to that user when the id is known.
7. **Bot deletes** in `targetChat` the temporary forwarded copies that the moderator used as the trigger (they have been re-emitted by the bot).
8. **Bot deletes** in `sourceChat` all messages that were part of the forwarded set.
9. **Bot posts** in `sourceChat` a redirect notice:

   ```
   The message "{topicLabel}" from <a href="{linkToUser}">{userDisplayName}</a> with responses forwarded to the chat <a href="{linkToTargetChatThread}">{targetChatName}</a>. Please continue the conversation there.
   ```

   - `{topicLabel}` — AI-generated topic if AI is enabled; otherwise truncated root message text.

### Outcome

- Target has a durable thread (header + replies) with a readable title.
- Source no longer contains the offtopic cluster; members see where to continue.
- Moderator did not hand-edit links or re-forward piece by piece.

### Edge cases (to handle in implementation)

| Case | Expected direction |
|------|--------------------|
| Only one message forwarded | Header uses resolved title; no extra forwards into the thread; still delete source + temps; post notice |
| Bundle order ambiguous | Prefer chronological order from stored `date` / message ids |
| Several forwards in a short burst | Forwards from the same user in `targetChat` are one batch after **2 seconds** of quiet. The earliest stored source message is the root |
| Match failure (forward not found in DB, or more than one candidate) | Do not delete anything; tell the moderator in the target chat that history was missing |
| Partial permissions (can’t delete) | Abort destructive steps that have not run; surface an error to the moderator. The job row keeps the last committed phase |
| Media / stickers / albums | Non-root messages are copied into the reply thread, including stickers and files. Photos and other captionable media get the same `— {authorName}` suffix as text. Stickers and other types with nowhere to put text are copied without that line. A media-only root is represented only by the “Media message” label and is not copied again. Album grouping may split into separate replies |
| AI timeout / error | Fall back to no-AI title resolution; do not block relocate |
| AI disabled | Truncate / use message text only (120 characters for `{threadTitle}` and `{topicLabel}`) |

---

## Flow B — Target chat: message outside any thread

**Actor:** Any member in `targetChat`  
**Trigger:** Bot sees a new message in `targetChat` that is **not** part of an existing thread (and is not part of Flow A’s in-flight processing).

### Steps

1. Bot replies to that message with a prompt and **inline buttons**:

   ```
   Your message is sent without relation to any thread. To which thread it should be forwarded?
   [Create a new thread]
   [Recent thread 1 label]
   [Recent thread 2 label]
   [Recent thread 3 label]
   [Recent thread 4 label]
   [Recent thread 5 label]
   ```

2. Thread button labels (from stored thread title / topic label):

   ```
   Thread: {topicLabel12}
   ```

   where `{topicLabel12}` is `{topicLabel}` shortened to **12** characters. “Recent” = last **5** threads known for this `targetChat` (from DB).

3. **User picks an existing thread**
   - Bot forwards (or moves) the user’s message into the selected thread.
   - Bot deletes the original loose message and the prompt message.

4. **User picks “Create a new thread”**
   - Bot creates a new thread with this message as the basis (same header pattern and title resolution as Flow A where applicable).
   - Bot deletes the user’s loose message (and the prompt).

### Outcome

Target chat stays thread-oriented; accidental top-level posts are recoverable without moderator intervention.

### Edge cases

| Case | Expected direction |
|------|--------------------|
| User ignores the prompt | Prompt remains until acted on or timed out (timeout policy TBD) |
| Concurrent loose messages | Each gets its own prompt; don’t mix callback payloads |
| Fewer than 5 threads exist | Show only available threads + “Create a new thread” |
| Callback from non-author | Ignore or answer “only the author can choose” (policy TBD; default: author-only) |

---

## Flow C — Operator configures chat pair

**Actor:** Operator / admin  
**Trigger:** Mini App (M4) or **slash commands** (M1 interim). Env vars can seed a pair for local/Test DC.

### M1 interim — slash commands + env seed

Until the Mini App lands, operators configure a pair with:

| Mechanism | Behavior |
|-----------|----------|
| Env seed | On boot, if `SOURCE_CHAT_ID` and `TARGET_CHAT_ID` are set, upsert an enabled `chat_pairs` row (idempotent). |
| `/pair source` | In a group where the caller is admin: set this chat as `sourceChat` (completes or updates the active pair). |
| `/pair target` | Same for `targetChat`. |
| `/status` | Show the enabled pair (ids, titles) and whether this chat is source, target, or neither. |
| `/unpair` | Soft-disable (`enabled=false`) the pair that includes this chat. |

Admin check uses Telegram chat member status (`creator` / `administrator`). Bot must already be a member of both chats. Message ingest starts for chats that appear in an enabled pair.

When Telegram upgrades a basic group to a supergroup, the chat id changes. The bot listens for `migrate_to_chat_id` (in the old group) and `migrate_from_chat_id` (in the new supergroup) and rewrites that id in `chat_pairs`, stored `messages`, `threads`, unfinished `relocation_jobs` payloads, and any in-memory `/pair` draft so the pair stays linked without re-running `/pair`.

### Steps (logical — full product)

1. Authenticate as chat admin (slash-command admin check now; WebApp `initData` in M4).
2. Select or confirm `sourceChat`.
3. Select or confirm `targetChat`.
4. Optionally set locale for the pair / community.
5. Optionally **override message templates** (thread header, source notice, Flow B prompt, etc.) — edit text while keeping required `{placeholders}`; reset restores Lingui defaults for the active locale (Mini App).
6. Optionally enable AI thread titles for this pair (if the deployment supports AI).
7. Bot stores the link and overrides; optionally posts a confirmation in both chats.
8. Bot begins (or continues) persisting messages for those chats.

### Outcome

No code edit required to point the bot at the community’s chats. Env remains available for automation; slash commands (then Mini App) are the operator path.

---

## Flow D — Scenario IDs & observability

Normative scenario IDs for automated tests. Full harness, emulator vs Test DC depth, and CI policy: [testing.md](testing.md).

| ID | Flow | What to prove |
|----|------|----------------|
| `A1_relocate_happy` | A | Root + replies relocated; thread link; source notice; temps/originals deleted (AI off) |
| `A2_single_message` | A | Single-message relocate still cleans up and announces |
| `A3_match_failure_safe` | A | Match failure → **no deletes** |
| `A4_ai_title_optional` | A | With AI mocked/enabled: header/notice use generated topic; with AI failure: truncate fallback |
| `B1_loose_pick_thread` | B | Loose message attached to recent thread; prompt cleaned |
| `B2_loose_create_thread` | B | Loose message starts a new thread; original cleaned |
| `C1_pair_config` | C | Source/target pair persisted and used for ingest |
| `C2_template_override` | C | Custom template used when posting; reset restores translated default |

### Flow A observables (Test DC / acceptance)

For `A1` / `A2`, each destructive step must be checkable:

1. Header posted → assert link format (`?thread=`) and expected HTML/Lingui substrings (including resolved `{threadTitle}`).
2. Thread replies present → assert count and order.
3. Temp forwards gone from target.
4. Source messages gone; notice present with correct deep link and `{topicLabel}`.

If any assert would fail mid-flow in production, prefer **stop before delete** over half-applied cleanup (phases in [architecture.md](architecture.md)).
