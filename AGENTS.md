# AGENTS.md

Instructions for any agent (or person) working in this repository. The full
product specification is in `docs/AGENT_PROMPT.md` (Croatian); the architecture
is in `docs/ARCHITECTURE.md`.

## Commands

Node version is in `.nvmrc`; pnpm version is pinned in `package.json`
(`corepack enable` picks it up).

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Unit tests (Vitest) | `pnpm test` |
| Build site into `./dist` | `pnpm build` |
| JS size budgets | `pnpm size` (after `pnpm build`) |
| End-to-end tests (Playwright, from phase 3) | `pnpm e2e` |
| Dev server (game) | `pnpm dev` |
| Dev server (controller) | `pnpm dev:controller` |

CI (`.github/workflows/ci.yml`) runs lint, type check, unit tests, build, size
and e2e on every PR. `deploy.yml` publishes `main` to GitHub Pages.

## Working rules

- Work in phases from section 9 of the spec. One phase = one branch = one PR
  to `main`. Do not merge several phases into one PR.
- A PR is ready only when CI passes. Every PR description has three sections:
  **Što je napravljeno**, **Što je stvarno pokrenuto** (commands and CI
  results) and **Što nije provjereno** (everything that needs a physical phone).
- Never claim something was tested on a device. Never state end-to-end latency
  from swing to screen, not even as an estimate; only the owner measures it.
- When a human step is needed (GitHub settings, secrets, sensor recordings,
  phone tests), open an issue labelled `needs-human` with exact steps (where to
  click, which command, what to send back), then continue with everything
  that does not depend on it.
- Do not add a dependency if the job fits in about fifty lines. Justify every
  new dependency with one sentence in the PR description.
- Secrets and keystores never go into the repository.
- Code, comments and commit messages are in English. Game and controller UI and
  `docs/SETUP.md` and `docs/MANUAL_TEST.md` are in Croatian.

## Layout

```
packages/protocol    message types, binary encoding, protocol version
packages/sim         physics, rules, gesture recognition, bot (no Vue/Three/DOM)
packages/net         pairing, WebRTC channels, reconnect, ping
apps/game            Vue + TresJS: split screen, start screen, QR, diagnostics
apps/controller      phone controller (plain TypeScript)
fixtures/traces      recorded phone sensor traces (JSON)
docs/                ARCHITECTURE.md, SETUP.md, MANUAL_TEST.md
```

## Invariants

- `packages/sim` must stay deterministic: same inputs and seed give the same
  match. It must not import Vue, Three or touch the DOM (enforced by ESLint).
- The simulation runs at a fixed 120 Hz, independent of frame rate.
- All physics and gesture constants live in `packages/sim/src/config.ts`, each
  with a comment.
- Internal packages export TypeScript sources directly (`exports: ./src/index.ts`);
  there is no separate build step for them.
