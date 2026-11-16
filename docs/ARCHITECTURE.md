# Arhitektura / Architecture

This document grows with each phase.

## Overview

- The game is a static site (Vue 3 + Vite + TresJS) served from GitHub Pages.
- The phone controller is a second static page on the same origin, at `c/`.
- The simulation (`packages/sim`) runs in the desktop browser at a fixed
  120 Hz and is the single source of truth for ball, rules and score.
- Phones connect directly to the desktop browser over WebRTC DataChannels;
  a public signalling server is used only for pairing.

## Deployment

`pnpm build` builds every workspace package and `scripts/assemble.mjs` merges
them into `./dist`:

```
dist/        game
dist/c/      controller
```

`deploy.yml` sets `BASE_PATH=/<repo>/` and `CONTROLLER_BASE_PATH=/<repo>/c/`
so the site works under `https://<user>.github.io/<repo>/`.

## Versions

TypeScript is pinned to the latest 6.0.x rather than 7.x, because
`typescript-eslint` (peer range `<6.1.0`) and `vue-tsc` rely on the JavaScript
compiler API that TypeScript 7 (the native port) does not provide yet.
