# Mobitenis

A lightweight 3D table tennis game that runs entirely in the browser, with an
Android phone as the racket. Inspired by table tennis in Wii Sports Resort.
Two players sit in front of one computer, each with a phone, on a split
screen.

- **Play:** https://erikpustinja.github.io/MobileTennis/
- **Setup (Croatian):** [docs/SETUP.md](docs/SETUP.md)
- **Manual test checklist (Croatian):** [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Working rules and commands:** [AGENTS.md](AGENTS.md)
- **Original specification (Croatian):** [docs/AGENT_PROMPT.md](docs/AGENT_PROMPT.md)

```
pnpm install
pnpm dev        # game on http://localhost:5173
pnpm test       # unit tests
pnpm build && pnpm e2e
```
