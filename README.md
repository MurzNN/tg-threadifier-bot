# Threadifier Bot

Telegram bot that turns offtopic digressions into proper threads in a helper chat — then cleans up the main chat and leaves a clear redirect.

## Why

In topic-strict group chats, offtopic posts attract replies before moderators notice. Cleaning up means manually forwarding a whole subtree to another chat, deleting originals, and posting an explanation. Threadifier automates that routine.

## How it works (short)

1. Moderator selects offtopic messages in the **source** chat and forwards them to the **target** chat.
2. The bot recognizes those forwards, posts a thread header in the target, re-forwards replies into that thread, and deletes the temporary forwards.
3. The bot deletes the originals in the source and posts a notice with a link to the new thread.

See [docs/workflows.md](docs/workflows.md) for full scenarios, including “no loose messages in target chat” enforcement.

## Status

**M0 scaffold complete:** TypeScript + GrammY + Hono no-op bot answers `/start` (Lingui `en`), Zod env, pino logs, Vitest transformer sample. Persistence and relocate workflows are next — [docs/roadmap.md](docs/roadmap.md).

## Stack

- **Language:** TypeScript
- **Bot framework:** [GrammY](https://grammy.dev/)
- **HTTP:** [Hono](https://hono.dev/) (health now; webhook, Mini App, config API later)
- **i18n:** [Lingui](https://lingui.dev/) for all default bot templates and Mini App UI; operators can override bot templates in the app
- **Validation / logs:** [Zod](https://zod.dev/) + [pino](https://getpino.io/)
- **DB (upcoming):** [Drizzle](https://orm.drizzle.team/) — SQLite locally, Postgres in Helm
- **Mini App (upcoming):** React + Vite static SPA (same app; no SSR for v1)
- **Deploy:** Docker image + Helm chart
- **Testing:** Vitest + GrammY API transformers (local Bot API emulator and Test DC + mtcute later) — [docs/testing.md](docs/testing.md)

Details: [docs/architecture.md](docs/architecture.md).

## Quickstart

Requires [Nub](https://nubjs.com/) (`curl -fsSL https://nubjs.com/install.sh | bash`, or `npm install -g @nubjs/nub`).

```bash
cp .env.example .env   # set BOT_TOKEN from BotFather
nub install
nub run test
nub run dev            # long polling + GET /health on PORT (default 3000)
```

Useful scripts: `nub run typecheck`, `nub run lint`, `nub run i18n:extract`, `nub run i18n:compile`, `nub run build` / `nub run start`. Nub loads `.env` automatically when running scripts/files.

Operators will bind chats via the Mini App (roadmap M4), not by editing code. Until then the bot only answers `/start`.

### CI & releases

- **CI:** GitHub Actions (`nubjs/setup-nub`) runs typecheck, lint, and `nub run test` on PRs and `main`.
- **Release:** [release-it](https://github.com/release-it/release-it) on `main` updates `CHANGELOG.md`, tags, creates a GitHub Release, and publishes `ghcr.io/<owner>/threadifier-bot` when Conventional Commits warrant a bump (or via workflow_dispatch `increment`). See [docs/contributing.md](docs/contributing.md#releases--versioning).

## Docs

| Document | Description |
|----------|-------------|
| [docs/brief.md](docs/brief.md) | Problem & vision |
| [docs/workflows.md](docs/workflows.md) | User journeys |
| [docs/architecture.md](docs/architecture.md) | Technical design |
| [docs/testing.md](docs/testing.md) | Unit, emulator, Test DC E2E |
| [docs/roadmap.md](docs/roadmap.md) | Milestones |
| [docs/contributing.md](docs/contributing.md) | Commits, branches, PRs |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |

## Contributing

Use [Conventional Commits](https://www.conventionalcommits.org/) and short-lived branches off `main`. See [docs/contributing.md](docs/contributing.md).

## License

[MIT](LICENSE) © Alexey Korepov

## Permissions the bot will need

Typical requirements (exact set finalized during implementation):

- Read messages in source and target (membership + privacy mode off / group privacy as needed)
- Delete messages in both chats
- Post messages (including HTML links) in both chats
- Forward messages into threads in the target chat

The bot account must be an admin (or have sufficient rights) in both chats.
