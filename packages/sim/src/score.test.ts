import { describe, expect, it } from 'vitest';
import { defaultConfig } from './match.ts';
import { awardPoint, currentServer, newScore, validateScore } from './score.ts';
import type { MatchEvent, Side } from './types.ts';

const cfg = defaultConfig();

function play(sequence: Side[]) {
  const score = newScore(0);
  const events: MatchEvent[] = [];
  const servers: Side[] = [];
  for (const w of sequence) {
    servers.push(currentServer(score, cfg));
    awardPoint(score, w, cfg, events);
  }
  return { score, events, servers };
}

describe('scoring', () => {
  it('switches serve every two points', () => {
    const { servers } = play([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(servers).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
  });

  it('switches serve every point from 10:10', () => {
    const seq: Side[] = [];
    for (let i = 0; i < 10; i++) seq.push(0, 1);
    seq.push(0, 1, 0, 1);
    const { servers } = play(seq);
    expect(servers.slice(20)).toEqual([0, 1, 0, 1]);
  });

  it('wins a set at 11 with a two point lead', () => {
    const { score, events } = play(Array<Side>(11).fill(0));
    expect(score.sets).toEqual([1, 0]);
    expect(score.history).toEqual([[11, 0]]);
    expect(events).toContainEqual({ type: 'set', winner: 0 });
  });

  it('does not end the set at 11:10 and ends it at 13:11', () => {
    const seq: Side[] = [];
    for (let i = 0; i < 10; i++) seq.push(0, 1);
    seq.push(0, 1, 0);
    let r = play(seq); // 12:11... check intermediate
    expect(r.score.sets).toEqual([0, 0]);
    seq.push(0);
    r = play(seq);
    expect(r.score.history).toEqual([[13, 11]]);
  });

  it('alternates the first server between sets and ends the match', () => {
    const seq = Array<Side>(22).fill(1);
    const { score, events } = play(seq);
    expect(score.winner).toBe(1);
    expect(events.filter((e) => e.type === 'match')).toHaveLength(1);
    expect(score.firstServerOfSet).toBe(0);
    expect(validateScore(score, cfg)).toEqual([]);
  });

  it('flags an invalid score', () => {
    const score = newScore(0);
    score.history.push([11, 10]);
    score.sets = [1, 0];
    expect(validateScore(score, cfg).length).toBeGreaterThan(0);
  });
});
