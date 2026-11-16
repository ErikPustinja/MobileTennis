import type { SensorSample } from './sample.ts';

/** File format of a recorded sensor trace (fixtures/traces/*.json). */
export interface SensorTrace {
  format: 'mobitenis-trace';
  version: 1;
  /** What the person did, e.g. "forehand-jaki". */
  label: string;
  recordedAt: string;
  /** Browser user agent of the phone. */
  device: string;
  /** True for generated (not recorded) traces. */
  synthetic?: boolean;
  /** Optional free-form notes (how the phone was held, etc.). */
  notes?: string;
  samples: SensorSample[];
}

export function isTrace(x: unknown): x is SensorTrace {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as SensorTrace).format === 'mobitenis-trace' &&
    Array.isArray((x as SensorTrace).samples)
  );
}
