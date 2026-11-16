import { describe, expect, it } from 'vitest';
import { SIM_HZ } from './index.ts';

describe('sim', () => {
  it('runs at a fixed 120 Hz step', () => {
    expect(SIM_HZ).toBe(120);
  });
});
