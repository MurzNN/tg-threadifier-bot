# Integration tests

M1 ships a **PGlite persistence smoke** (`pglite-smoke.test.ts`) so CI proves DB migrate/upsert/seed without Telegram secrets.

A local Bot API emulator (e.g. `telegram-test-api`) will plug in here for Flow A/B HTTP-path scenarios in later milestones. Shared scenario IDs stay in `specs/workflows.md` / `specs/testing.md`.
