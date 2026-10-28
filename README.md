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

Documentation / design phase. Implementation has not started. See [docs/roadmap.md](docs/roadmap.md).

## Stack (planned)

- **Language:** TypeScript
- **Bot framework:** [GrammY](https://grammy.dev/)
- **HTTP:** [Hono](https://hono.dev/) (webhook, health, Mini App, config API)
- **i18n:** [Lingui](https://lingui.dev/) (all user-facing copy)
- **DB:** [Drizzle](https://orm.drizzle.team/) — SQLite locally, Postgres in Helm
- **Mini App:** React + Vite static SPA (same app; no SSR for v1)
- **Deploy:** Docker image + Helm chart
- **Testing:** Vitest + local Bot API emulator on PRs; Telegram Test DC + mtcute scenarios for release acceptance — [docs/testing.md](docs/testing.md)

Details: [docs/architecture.md](docs/architecture.md).

## Quickstart

> Placeholder until the first runnable milestone lands.

```bash
# expected shape (to be confirmed in M1)
cp .env.example .env   # BOT_TOKEN, DB URL, etc.
npm install
npm run dev
```

Operators will bind chats via the bot’s configuration flow (Mini App), not by editing code.

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
