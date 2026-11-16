import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  SAMPLE_BYTES,
  decodeSample,
  encodeSample,
  parseGameMessage,
  parsePhoneMessage,
  tokenKey,
  unwrapTime,
  type SensorSample,
} from './index.ts';

const sample: SensorSample = {
  seq: 42,
  t: 123456.7,
  accel: [0.5, -1.25, 9],
  accelG: [0.1, 9.81, -0.2],
  rot: [10, -200.5, 3],
  orient: [359, -45, 80],
};

describe('binary samples', () => {
  it('round-trips within float32 precision and fits in 64 bytes', () => {
    const buf = encodeSample(sample, 0xdeadbeef);
    expect(buf.byteLength).toBe(SAMPLE_BYTES);
    const d = decodeSample(buf)!;
    expect(d.key).toBe(0xdeadbeef);
    expect(d.sample.seq).toBe(42);
    expect(d.sample.t).toBeCloseTo(123456.7, 1);
    expect(d.sample.accel![1]).toBeCloseTo(-1.25, 5);
    expect(d.sample.rot![1]).toBeCloseTo(-200.5, 3);
    expect(d.sample.orient![0]).toBeCloseTo(359, 3);
  });

  it('keeps missing sensors as null', () => {
    const d = decodeSample(encodeSample({ ...sample, accel: null, orient: null }, 1))!;
    expect(d.sample.accel).toBeNull();
    expect(d.sample.orient).toBeNull();
    expect(d.sample.accelG).not.toBeNull();
  });

  it('rejects wrong length, type or protocol version', () => {
    expect(decodeSample(new ArrayBuffer(10))).toBeNull();
    const buf = encodeSample(sample, 1);
    new DataView(buf).setUint8(1, PROTOCOL_VERSION + 1);
    expect(decodeSample(buf)).toBeNull();
  });

  it('unwraps phone time across the 32-bit boundary', () => {
    const period = 2 ** 32 / 10;
    expect(unwrapTime(5, period - 5)).toBeCloseTo(period + 5);
    expect(unwrapTime(period - 5, 5)).toBeCloseTo(-5);
  });

  it('derives a stable key from a token', () => {
    expect(tokenKey('abc')).toBe(tokenKey('abc'));
    expect(tokenKey('abc')).not.toBe(tokenKey('abd'));
  });
});

describe('messages', () => {
  it('accepts valid phone messages and rejects malformed ones', () => {
    expect(parsePhoneMessage(JSON.stringify({ t: 'cmd', id: 'a1', cmd: 'serve' }))).toEqual({ t: 'cmd', id: 'a1', cmd: 'serve' });
    expect(parsePhoneMessage(JSON.stringify({ t: 'cmd', id: 'a1', cmd: 'jump' }))).toBeNull();
    expect(parsePhoneMessage('not json')).toBeNull();
    expect(parsePhoneMessage(JSON.stringify({ t: 'hello', v: 1, room: 'ABCDE', slot: 3, token: null, clientId: 'x', ua: '' }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ t: 'hit' }))).toEqual({ t: 'hit' });
    expect(parseGameMessage(JSON.stringify({ t: 'evil' }))).toBeNull();
  });
});
