import type { Side } from '@mobitenis/sim';

/** Player colours; the controller uses the same values. */
export const PLAYER_COLORS: Record<Side, string> = {
  0: '#ff7a1a',
  1: '#2f9bff',
};

export const PLAYER_NAMES: Record<Side, string> = {
  0: 'Igrač 1',
  1: 'Igrač 2',
};
