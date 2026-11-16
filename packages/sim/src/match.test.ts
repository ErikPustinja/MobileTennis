import { describe, expect, it } from 'vitest';
import { Bot } from './bot.ts';
import { DT, PADDLE, SHOT, TABLE } from './config.ts';
import { hitPlaneZ } from './geometry.ts';
import { createMatch, predictCrossing, setPaused, stepMatch } from './match.ts';
import { validateScore } from './score.ts';
import { rallyShot } from './shot.ts';
import { idleInput, type MatchEvent, type MatchState, type PlayerInput, type Side } from './types.ts';

const idle = (): [PlayerInput, PlayerInput] => [idleInput(), idleInput()];

/** Puts the match mid-rally with player 2 having just hit toward player 1. */
function rallyToward0(strength = 0.5): MatchState {
  const s = createMatch();
  s.rally.phase = 'inPlay';
  s.rally.serveStage = null;
  s.rally.lastHitter = 1;
  s.rally.bounced = false;
  const contact = { x: 0, y: 1, z: hitPlaneZ(1) };
  const shot = rallyShot({ side: 1, contact, strength, direction: 0, timingError: 0, pitch: 0, forehand: true });
  s.ball = { pos: contact, vel: shot.vel, topspin: shot.topspin, active: true };
  s.prediction = predictCrossing(s.ball, 0, s.time);
  return s;
}

function run(s: MatchState, seconds: number, inputAt?: (s: MatchState) => [PlayerInput, PlayerInput]): MatchEvent[] {
  const all: MatchEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepMatch(s, inputAt ? inputAt(s) : idle());
    all.push(...s.events);
  }
  return all;
}

/** Swing for player 1 so the natural contact is `offset` seconds after the ball arrives. */
function swingWithOffset(offset: number, strength = 0.5) {
  let swung = false;
  return (s: MatchState): [PlayerInput, PlayerInput] => {
    const inputs = idle();
    const pred = s.prediction;
    const speed = PADDLE.swingMinSpeed + (PADDLE.swingMaxSpeed - PADDLE.swingMinSpeed) * strength;
    if (!swung && pred && pred.side === 0 && s.time >= pred.time + offset - PADDLE.backswing / speed) {
      swung = true;
      inputs[0].swing = { strength, direction: 0 };
    }
    return inputs;
  };
}

describe('match flow', () => {
  it('a missed return gives the point to the hitter', () => {
    const s = rallyToward0();
    const events = run(s, 3);
    expect(events).toContainEqual({ type: 'point', winner: 1, reason: 'not-returned' });
    expect(s.score.points).toEqual([0, 1]);
  });

  it('a ball hit long is out and goes to the opponent', () => {
    const s = rallyToward0();
    s.ball.vel = { x: 0, y: 2, z: -14 };
    s.prediction = null;
    const events = run(s, 2);
    expect(events).toContainEqual({ type: 'point', winner: 0, reason: 'out' });
  });

  it('a ball into the net loses the point for the hitter', () => {
    const s = rallyToward0();
    s.ball.pos = { x: 0, y: TABLE.height + 0.08, z: 0.5 };
    s.ball.vel = { x: 0, y: 0, z: -6 };
    const events = run(s, 2);
    expect(events.some((e) => e.type === 'net')).toBe(true);
    expect(events).toContainEqual({ type: 'point', winner: 0, reason: 'own-side' });
  });

  it('returns the ball when the swing is on time', () => {
    const s = rallyToward0();
    const events = run(s, 1.2, swingWithOffset(0));
    expect(events).toContainEqual({ type: 'hit', side: 0, strength: 0.5 });
    expect(events.filter((e) => e.type === 'bounce' && e.side === 1)).toHaveLength(1);
    expect(events.some((e) => e.type === 'point')).toBe(false);
  });

  it.each([-0.1, 0.1])('forgives a timing error of %s s', (offset) => {
    const s = rallyToward0();
    const events = run(s, 1.2, swingWithOffset(offset));
    expect(events.some((e) => e.type === 'hit' && e.side === 0)).toBe(true);
  });

  it.each([-0.25, 0.25])('misses with a timing error of %s s', (offset) => {
    const s = rallyToward0();
    const events = run(s, 3, swingWithOffset(offset));
    expect(events.some((e) => e.type === 'hit' && e.side === 0)).toBe(false);
    expect(events.some((e) => e.type === 'point' && e.winner === 1)).toBe(true);
  });

  it('hits at the fastest swing speed without the paddle passing through the ball', () => {
    const s = rallyToward0(1);
    const events = run(s, 1.2, swingWithOffset(SHOT.timingTolerance * 0.9, 1));
    expect(events.some((e) => e.type === 'hit' && e.side === 0)).toBe(true);
    expect(s.ball.vel.z).toBeGreaterThan(0);
  });

  it('serves when the serve button is pressed and the toss is hit', () => {
    const s = createMatch();
    const events = run(s, 2.5, (st) => {
      const inputs = idle();
      if (st.rally.phase === 'serveReady') inputs[0].serve = true;
      if (st.rally.phase === 'toss' && st.ball.vel.y < 0.3 && !st.players[0].swing) {
        inputs[0].swing = { strength: 0.5, direction: 0 };
      }
      return inputs;
    });
    const bounces = events.filter((e) => e.type === 'bounce').map((e) => (e as { side: Side }).side);
    expect(bounces.slice(0, 2)).toEqual([0, 1]);
  });

  it('a missed toss is retried without a point', () => {
    const s = createMatch();
    const events = run(s, 2, (st) => {
      const inputs = idle();
      if (st.rally.phase === 'serveReady' && st.time < 0.1) inputs[0].serve = true;
      return inputs;
    });
    expect(events.some((e) => e.type === 'point')).toBe(false);
    expect(s.rally.phase).toBe('serveReady');
  });

  it('does not advance while paused', () => {
    const s = rallyToward0();
    setPaused(s, true);
    const pos = { ...s.ball.pos };
    run(s, 1);
    expect(s.tick).toBe(0);
    expect(s.ball.pos).toEqual(pos);
  });

  it('moves the paddle to the player-perspective right for both players', () => {
    const s = createMatch();
    const inputs = idle();
    inputs[0].lateral = 1;
    inputs[1].lateral = 1;
    for (let i = 0; i < 60; i++) stepMatch(s, inputs);
    // Player 1 faces +z, so their right is -x; player 2 faces -z, right is +x.
    expect(s.players[0].paddle.pos.x).toBeLessThan(-0.2);
    expect(s.players[1].paddle.pos.x).toBeGreaterThan(0.2);
  });
});

function botMatch(seed: number, points: number) {
  const s = createMatch({ seed, config: { setsToWin: 99 } });
  const bots = [new Bot(0, seed), new Bot(1, seed)] as const;
  const log: string[] = [];
  let played = 0;
  let hits = 0;
  const maxTicks = 120 * 60 * 90;
  while (played < points && s.tick < maxTicks) {
    stepMatch(s, [bots[0].next(s), bots[1].next(s)]);
    for (const e of s.events) {
      if (e.type === 'point') {
        played++;
        log.push(`${s.tick}:${e.winner}:${e.reason}`);
        expect(validateScore(s.score, s.config)).toEqual([]);
      }
      if (e.type === 'hit') hits++;
    }
  }
  return { s, log, played, hits };
}

describe('bot vs bot', () => {
  it('plays 200 points to a valid score', () => {
    const { s, played, hits } = botMatch(42, 200);
    expect(played).toBe(200);
    expect(validateScore(s.score, s.config)).toEqual([]);
    const total = s.score.history.reduce((n, [a, b]) => n + a + b, 0) + s.score.points[0] + s.score.points[1];
    expect(total).toBe(200);
    expect(hits / played).toBeGreaterThan(3); // real rallies, not just serves
  });

  it('is deterministic for the same seed', () => {
    const a = botMatch(7, 60);
    const b = botMatch(7, 60);
    expect(b.log).toEqual(a.log);
    expect(b.s.score).toEqual(a.s.score);
    expect(b.s.ball).toEqual(a.s.ball);
  });

  it('differs for a different seed', () => {
    expect(botMatch(8, 30).log).not.toEqual(botMatch(9, 30).log);
  });

  it('finishes a normal best-of-three match', () => {
    const s = createMatch({ seed: 3 });
    const bots = [new Bot(0, 3), new Bot(1, 3)] as const;
    while (s.rally.phase !== 'matchOver' && s.tick < 120 * 60 * 60) stepMatch(s, [bots[0].next(s), bots[1].next(s)]);
    expect(s.rally.phase).toBe('matchOver');
    expect(s.score.winner).not.toBeNull();
    expect(Math.max(...s.score.sets)).toBe(2);
    expect(validateScore(s.score, s.config)).toEqual([]);
  });
});
