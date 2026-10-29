# Threadifier Bot

Telegram bot that turns offtopic digressions into proper threads in a helper chat — then cleans up the main chat and leaves a clear redirect.

Use the public instance: [@ThreadifierBot](https://t.me/ThreadifierBot).

The bot ships translations for **English**, **Spanish**, **French**, and **Russian**. `/language` sets the language for the current chat.

## Why

In topic-strict group chats, offtopic posts attract replies before moderators notice. Cleaning up means manually forwarding a whole subtree to another chat, deleting originals, and posting an explanation. Threadifier automates that routine.

## How it works (short)

1. Moderator selects offtopic messages in the **source** chat and forwards them to the **target** chat.
2. The bot recognizes those forwards, posts a thread header in the target, copies the other messages into that thread (each one keeps its author’s name at the end of the text), and deletes the temporary forwards.
3. The bot deletes the originals in the source and posts a notice with a link to the new thread.

See [specs/workflows.md](specs/workflows.md) for full scenarios, including “no loose messages in target chat” enforcement. End-user instructions: [GitHub Pages](https://murznn.github.io/tg-threadifier-bot/) (or `nub run docs:dev` locally).

## Status

**M2 Flow A:** A forward from the linked source into the target becomes a reply thread (header, copied replies, deletes, source notice). `A1`–`A3` run in CI against a local Bot API stub. A manual Test DC walkthrough is still the release check — [specs/testing.md](specs/testing.md#manual-a1-until-m5-automation).

## Stack

- **Language:** TypeScript
- **Bot framework:** [GrammY](https://grammy.dev/)
- **HTTP:** [Hono](https://hono.dev/) (health now; webhook, Mini App, config API later)
- **i18n:** [Lingui](https://lingui.dev/) for all default bot templates and Mini App UI; operators can override bot templates in the app
- **Validation / logs:** [Zod](https://zod.dev/) + [pino](https://getpino.io/)
- **DB:** [Drizzle](https://orm.drizzle.team/) — PostgreSQL dialect (PGlite locally, Postgres in Helm)
- **Mini App (upcoming):** React + Vite static SPA (same app; no SSR for v1)
- **Deploy:** Docker image + Helm chart
- **Testing:** Vitest + GrammY API transformers (local Bot API emulator and Test DC + mtcute later) — [specs/testing.md](specs/testing.md)

Details: [specs/architecture.md](specs/architecture.md).

## Quickstart

Requires [Nub](https://nubjs.com/) (`curl -fsSL https://nubjs.com/install.sh | bash`, or `npm install -g @nubjs/nub`).

```bash
cp .env.example .env   # set BOT_TOKEN from BotFather
nub install
nub run test
nub run dev            # long polling + GET /health on PORT (default 3000)
```

Useful scripts: `nub run typecheck`, `nub run lint`, `nub run i18n:extract`, `nub run db:studio` (local PGlite at `file:./data/threadifier-pg` unless `DATABASE_URL` is a Postgres URL), `nub run build` / `nub run start`. Nub loads `.env` automatically when running scripts/files.

Operators bind chats with `/pair source` and `/pair target` (or `SOURCE_CHAT_ID` / `TARGET_CHAT_ID` / `CONFIGURED_BY_USER_ID`), review their own pairs with `/pair` or `/status`, and delete them with `/unpair` until the Mini App (M4). `/language` sets the command language for the current chat. `/start` stores a fallback from the Telegram account when the bot ships that language, otherwise English, for chats that have not chosen one.

### Docker & Helm

```bash
docker build -t tg-threadifier-bot:local .

helm dependency update ./charts/tg-threadifier-bot
helm upgrade --install threadifier ./charts/tg-threadifier-bot \
  --namespace threadifier --create-namespace \
  --set secrets.credentials.stringData.BOT_TOKEN='…' \
  --set secrets.credentials.stringData.DATABASE_URL='postgresql://threadifier:changeme@threadifier-postgres:5432/threadifier'
```

Chart details: [charts/tg-threadifier-bot/README.md](charts/tg-threadifier-bot/README.md). Image publishes to GHCR on release.

### CI & releases

- **CI:** GitHub Actions (`nubjs/setup-nub`) runs typecheck, lint, and `nub run test` on PRs and `main`.
- **Docs site:** pushes that touch `docs/` deploy the Starlight user guide to [GitHub Pages](https://murznn.github.io/tg-threadifier-bot/) (set **Settings → Pages → Source: GitHub Actions** once).
- **Release:** [release-it](https://github.com/release-it/release-it) on `main` updates `CHANGELOG.md`, tags, creates a GitHub Release, and publishes `ghcr.io/<owner>/tg-threadifier-bot` when Conventional Commits warrant a bump (or via workflow_dispatch `increment`). See [specs/contributing.md](specs/contributing.md#releases--versioning).

## Docs

### User guide

End-user instructions for members, moderators, and operators: [https://murznn.github.io/tg-threadifier-bot/](https://murznn.github.io/tg-threadifier-bot/). Locally: `nub run docs:dev` (preview build with `nub run docs:build` / `nub run docs:preview`).

### Specs

| Document | Description |
|----------|-------------|
| [specs/brief.md](specs/brief.md) | Problem & vision |
| [specs/workflows.md](specs/workflows.md) | User journeys |
| [specs/architecture.md](specs/architecture.md) | Technical design |
| [specs/testing.md](specs/testing.md) | Unit, emulator, Test DC E2E |
| [specs/roadmap.md](specs/roadmap.md) | Milestones |
| [specs/contributing.md](specs/contributing.md) | Commits, branches, PRs |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |

## Contributing

Use [Conventional Commits](https://www.conventionalcommits.org/) and short-lived branches off `main`. See [specs/contributing.md](specs/contributing.md).

## License

[MIT](LICENSE) © Alexey Korepov

## Permissions the bot will need

Typical requirements (exact set finalized during implementation):

- Read messages in source and target (membership + privacy mode off / group privacy as needed)
- Delete messages in both chats
- Post messages (including HTML links) in both chats
- Copy messages into the target thread (`copyMessage`)

The bot account must be an admin (or have sufficient rights) in both chats. The target should be a supergroup, not a forum: the thread is a reply thread on the header message.

Anyone who can forward source messages into the target starts a relocate, so keep that chat to moderators.
