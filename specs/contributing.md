# Contributing & Git workflow

Boilerplate for how we branch, commit, and open PRs. Keep changes reviewable and history useful for humans and agents.

---

## Branching strategy

**Model:** short-lived branches off `main` (GitHub Flow). `main` is always releasable or the single integration line.

| Branch | Purpose |
|--------|---------|
| `main` | Default branch. Protected when CI exists. No force-push. |
| `feat/<short-topic>` | New capability |
| `fix/<short-topic>` | Bug fix |
| `chore/<short-topic>` | Tooling, deps, non-product chores |
| `docs/<short-topic>` | Documentation only |
| `test/<short-topic>` | Test harness / scenarios |
| `refactor/<short-topic>` | Internal restructuring without behavior change |

**Practices:**

- Branch from up-to-date `main`; open a PR early if the work is multi-commit.
- Prefer **small PRs** (one concern). Split large roadmap items rather than mega-merges.
- Delete the branch after merge.
- Avoid long-lived feature branches and gitflow-style `develop` unless the team explicitly adopts them later.
- Do not commit secrets (`.env`, session files, tokens). Use `.env.example` and secret stores for Test DC E2E credentials — see [testing.md](testing.md).

```
main ──●──●────────●────────●──
        \        /        /
         feat/a ┘  fix/b ┘
```

---

## Naming (code & docs)

| Layer | Style |
|-------|-------|
| Docs, TypeScript, Lingui placeholders | **camelCase** (`sourceChat`, `{topicLabel}`) |
| SQL tables / columns | **snake_case** (`chat_pairs`, `topic_label`) |

See [workflows.md](workflows.md#naming--template-placeholders) and [architecture.md](architecture.md#naming-conventions).

## Conventional Commits

All commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) 1.0.0:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Use when |
|------|----------|
| `feat` | User-facing or product behavior added |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting; no logic change |
| `refactor` | Code change that is not feat/fix |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system or bundling |
| `ci` | CI configuration |
| `chore` | Maintenance (deps, ignore files, etc.) |
| `revert` | Reverts a previous commit |

### Scopes (suggested)

Optional but preferred when clear: `bot`, `db`, `webapp`, `i18n`, `e2e`, `helm`, `docs`.

Examples:

```
feat(bot): relocate offtopic batch into target thread
fix(db): abort relocate job when forward match fails
docs: add Test DC scenario catalog
test(e2e): cover A1 relocate happy path on Test DC
chore(ci): run unit and emulator integration on PRs
```

### Rules

- Description: imperative mood, lowercase start, no trailing period (`add`, not `Added` / `adds.`).
- Keep the subject ≈ **72 characters** or less.
- Body explains **why** when the diff is not obvious; wrap at ~100 chars.
- Breaking changes: `feat(api)!: ...` or a `BREAKING CHANGE:` footer.
- One logical change per commit when practical; do not mix unrelated refactors with feature work.
- Never use `--no-verify` / skip hooks unless explicitly required and documented in the PR.

---

## Pull requests

1. **Title** — same Conventional Commit style as the primary change (or a short summary if the PR contains several related commits).
2. **Description** — what / why; link issues or roadmap milestones; note Test DC or emulator impact.
3. **Test plan** — checklist (unit, emulator scenarios, manual Test DC if relevant). See [testing.md](testing.md).
4. **Docs** — if behavior changes, update `workflows` / `architecture` / `roadmap` / `testing` under `specs/` in the same PR ([AGENTS.md](../AGENTS.md)). If member/moderator/operator UX changes, update the Starlight pages under `docs/src/content/docs/` too.
5. **CI** — PR must pass unit + local Bot API emulator integration. Test DC E2E is the release gate, not necessarily every PR.
6. **Review** — prefer approval before merge; squash or rebase merge is fine once the team picks a default — keep `main` history readable (prefer squash for noisy WIP branches).

### Suggested PR body template

```markdown
## Summary
- 

## Test plan
- [ ] Unit / transformer tests
- [ ] Emulator integration (scenario IDs if any)
- [ ] Manual / Test DC (if behavior touches Telegram)

## Docs
- [ ] Updated relevant files under specs/ and/or end-user docs/
```

---

## Releases & versioning

Releases are automated with [release-it](https://github.com/release-it/release-it) and [@release-it/conventional-changelog](https://github.com/release-it/conventional-changelog).

| Piece | Behavior |
|-------|----------|
| Version bump | From Conventional Commits on `main` (`feat` → minor, `fix` → patch, `BREAKING CHANGE` → major) |
| Changelog | Updates `CHANGELOG.md` |
| Git | Commit `chore(release): vX.Y.Z` + tag `vX.Y.Z` |
| GitHub | Creates a GitHub Release |
| Container | Pushes `ghcr.io/<owner>/tg-threadifier-bot` tagged `latest`, `X.Y.Z`, and `vX.Y.Z` |

**CI workflows:**

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — typecheck, lint, and `nub run test` on PRs and pushes to `main`
- [`.github/workflows/docs.yml`](../.github/workflows/docs.yml) — builds the Starlight user guide and deploys to GitHub Pages
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — after tests on `main`, runs `release-it --ci` when there is a releasable bump, then builds/pushes the image to GHCR

`docs` / `chore` / `ci` commits alone usually **do not** cut a release. To force a version (e.g. first publish), use **Actions → Release → Run workflow** and set `increment` (`patch`, `minor`, `major`, or `x.y.z`).

Local dry-run:

```bash
nubx release-it --dry-run
```

Registry publish is disabled (`private: true`); the distributable artifact is the container image. Use **[Nub](https://nubjs.com/)** (`packageManager` / `nub.lock`); do not commit `package-lock.json` or `pnpm-lock.yaml`.

---

## Agent / automation notes

- Do not amend published commits or force-push `main`.
- Do not change git config.
- Create commits only when the human asks; follow Conventional Commit format above.
- Prefer updating specs (and end-user `docs/` when UX changes) in the same change set as behavior.
