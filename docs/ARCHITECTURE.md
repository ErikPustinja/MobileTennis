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

## Simulation (`packages/sim`)

The simulation is plain TypeScript with no Vue, Three or DOM imports
(enforced by ESLint). It is a pure function of its inputs:

```ts
const match = createMatch({ seed });
stepMatch(match, [inputP1, inputP2]); // one fixed 1/120 s step
match.events; // what happened in that step (hit, bounce, net, point, set, …)
```

- **Axes.** x across the table, y up, z along it. Player 1 stands at
  negative z facing +z, player 2 at positive z facing -z. The net is z = 0.
  Inputs are always in the player's own perspective ("right" means the
  player's right); `geometry.ts` converts them to world x.
- **Input.** `PlayerInput` = lateral paddle offset (-1…1), racket face tilt,
  and two one-step commands: `serve` and `swing { strength, direction }`.
  Keyboard, phone gestures and the bot all produce this same structure.
- **Ball.** Semi-implicit Euler with gravity, quadratic drag and a simplified
  topspin dip. Each step finds the earliest collision (table, net body, net
  cord, floor, swinging paddle), resolves it and continues with the rest of
  the step. Prediction and the shot solver use the same `stepBall`, so a
  predicted flight is exactly the simulated one.
- **Paddle contact.** The ball and a swinging paddle both move linearly
  within a step; contact is solved analytically along the paddle normal, so
  even the fastest swing cannot pass through the ball. A paddle touches the
  ball at most once per swing.
- **Swing assist and timing.** The character walks automatically toward the
  predicted crossing of its hitting plane (28 cm behind the end line). When a
  swing starts within ±120 ms (`SHOT.timingTolerance`) of the ideal moment,
  the paddle is retimed and nudged (within a limited reach) to meet the ball;
  early swings wait at the plane, late swings meet the ball behind it.
  Outside the window the swing simply misses.
- **Shot model.** Strength sets ball speed, depth and topspin; swing direction
  and timing set sideways aim; the face angle adds launch-angle error. A
  bisection over the vertical speed (using the real flight) aims the ball at
  a point on the opponent's half and lifts it over the net when needed.
- **Rules.** Serve: first bounce on the server's half, then the receiver's;
  a served ball that clips the net cord and lands correctly is a let. Rally:
  the ball must land on the opponent's half; a second bounce, a ball not
  returned, a ball hit out, a volley over the table or a double hit end the
  point. A missed toss is simply retried. Sets to 11 with a two-point lead,
  serve changes every two points and every point from 10:10, best of three.
- **Determinism.** No clocks, no `Math.random`. The bot has its own seeded
  PRNG. Tests replay a seeded bot match twice and compare the full point log.

## Rendering and split screen (`apps/game`)

- `GameSession` owns one `MatchState` and advances it from real elapsed time
  in fixed 1/120 s steps (at most 0.25 s per frame), so the simulation speed
  never depends on the frame rate. Inputs come from `InputSource`s
  (keyboard, bot, later phones), one per player.
- The scene is built from TresJS components using only basic Three.js
  geometry (boxes, planes, cylinders, capsules, spheres). Moving objects
  (ball, paddles, characters, arms) are updated imperatively once per frame
  from the match state, outside Vue reactivity.
- **One scene, two views.** `SceneContent.vue` replaces the TresJS render
  function: it renders the same scene twice into one canvas with scissor
  rectangles, once per player camera. The shadow map is rendered once per
  frame and shared by both views. Before each view, the own character's
  materials are made translucent and the opponent's opaque.
- Each camera sits behind its player, above and over the left shoulder.
  The vertical field of view is derived from the viewport aspect so the
  near end of the table fits even in a narrow half (`scene/layout.ts`).
- The HUD is plain HTML over the canvas: one panel per half with the
  player's colour border, score, sets, messages and status.
- A hidden tab pauses the match (`visibilitychange`). Esc toggles a manual
  pause; Space or the button resumes.

### Keyboard test controls

| | Player 1 | Player 2 |
|---|---|---|
| Serve | W | I |
| Sideways (and aim) | A / D | J / L |
| Forehand | E | O |
| Backhand | Q | U |
| Strong shot (hold) | Left Shift | Right Shift |

Keys are read by physical code (`KeyboardEvent.code`), so a Croatian QWERTZ
keyboard works the same way.

### End-to-end tests

`apps/game/e2e` (Playwright, headless Chromium with SwiftShader). Test hooks
are exposed on `window.__mobitenis` (match state, stats) and
`window.__mobitenisScene` (views, paddle position projected into each
player's camera). The keyboard test drives both players by dispatching real
`KeyboardEvent`s timed from the simulation's own prediction.
