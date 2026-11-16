import { reactive } from 'vue';
import type { MatchEvent, Phase, PointReason, Side } from '@mobitenis/sim';
import type { GameSession, PauseReason } from './session.ts';

/** Small reactive snapshot for the HUD; updated only when something changes. */
export interface UiState {
  points: [number, number];
  sets: [number, number];
  history: Array<[number, number]>;
  server: Side;
  phase: Phase;
  paused: boolean;
  pauseReasons: PauseReason[];
  lastPoint: { winner: Side; reason: PointReason; at: number } | null;
  letAt: number;
  winner: Side | null;
  rallyHits: number;
}

export function createUiState(): UiState {
  return reactive({
    points: [0, 0],
    sets: [0, 0],
    history: [],
    server: 0,
    phase: 'serveReady',
    paused: false,
    pauseReasons: [],
    lastPoint: null,
    letAt: 0,
    winner: null,
    rallyHits: 0,
  }) as UiState;
}

export function bindUi(ui: UiState, session: GameSession): () => void {
  const sync = (events: MatchEvent[], s: GameSession) => {
    const m = s.match;
    ui.points = [m.score.points[0], m.score.points[1]];
    ui.sets = [m.score.sets[0], m.score.sets[1]];
    ui.history = m.score.history.map(([a, b]) => [a, b]);
    ui.server = m.rally.server;
    ui.phase = m.rally.phase;
    ui.paused = s.paused;
    ui.pauseReasons = s.pauseReasons();
    ui.winner = m.score.winner;
    ui.rallyHits = m.rally.rallyHits;
    for (const e of events) {
      if (e.type === 'point') ui.lastPoint = { winner: e.winner, reason: e.reason, at: m.time };
      if (e.type === 'let') ui.letAt = m.time;
      if (e.type === 'serveReady' && ui.lastPoint && m.time - ui.lastPoint.at > 0.5) ui.lastPoint = null;
    }
  };
  sync([], session);
  return session.onChange(sync);
}
