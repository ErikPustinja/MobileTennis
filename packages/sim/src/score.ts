import type { MatchConfig, MatchEvent, ScoreState, Side } from './types.ts';

export function newScore(firstServer: Side): ScoreState {
  return { points: [0, 0], sets: [0, 0], history: [], firstServerOfSet: firstServer, winner: null };
}

/**
 * Server for the current point: alternates every `serveSwitchEvery` points,
 * and every point once both players have reached `deuceAt`.
 */
export function currentServer(score: ScoreState, cfg: MatchConfig): Side {
  const [a, b] = score.points;
  const total = a + b;
  const deuceTotal = cfg.deuceAt * 2;
  const block =
    a >= cfg.deuceAt && b >= cfg.deuceAt
      ? Math.floor(deuceTotal / cfg.serveSwitchEvery) + (total - deuceTotal)
      : Math.floor(total / cfg.serveSwitchEvery);
  return ((score.firstServerOfSet + block) % 2) as Side;
}

/** Adds a point, closing the set and the match when they are won. */
export function awardPoint(score: ScoreState, winner: Side, cfg: MatchConfig, events: MatchEvent[]): void {
  if (score.winner !== null) return;
  score.points[winner]++;
  const mine = score.points[winner];
  const theirs = score.points[winner === 0 ? 1 : 0];
  if (mine >= cfg.pointsToWinSet && mine - theirs >= cfg.winBy) {
    score.history.push([score.points[0], score.points[1]]);
    score.sets[winner]++;
    score.points = [0, 0];
    // The player who received first in the previous set serves first in the next.
    score.firstServerOfSet = score.firstServerOfSet === 0 ? 1 : 0;
    events.push({ type: 'set', winner });
    if (score.sets[winner] >= cfg.setsToWin) {
      score.winner = winner;
      events.push({ type: 'match', winner });
    }
  }
}

/** Checks the invariants of a valid score; returns a list of problems. */
export function validateScore(score: ScoreState, cfg: MatchConfig): string[] {
  const problems: string[] = [];
  for (const [a, b] of score.history) {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (hi < cfg.pointsToWinSet) problems.push(`set ${a}:${b} ended below ${cfg.pointsToWinSet}`);
    if (hi - lo < cfg.winBy) problems.push(`set ${a}:${b} without a ${cfg.winBy}-point lead`);
    if (hi > cfg.pointsToWinSet && hi - lo !== cfg.winBy) problems.push(`set ${a}:${b} went past deuce incorrectly`);
  }
  const won: [number, number] = [0, 0];
  for (const [a, b] of score.history) won[a > b ? 0 : 1]++;
  if (won[0] !== score.sets[0] || won[1] !== score.sets[1]) problems.push('set count does not match history');
  const [a, b] = score.points;
  if (Math.max(a, b) >= cfg.pointsToWinSet && Math.abs(a - b) >= cfg.winBy) problems.push(`unfinished set at ${a}:${b}`);
  if (score.winner !== null && score.sets[score.winner] !== cfg.setsToWin) problems.push('winner without enough sets');
  if (score.winner === null && Math.max(...score.sets) >= cfg.setsToWin) problems.push('match should be over');
  return problems;
}
