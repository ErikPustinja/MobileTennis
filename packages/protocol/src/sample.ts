import { PROTOCOL_VERSION } from './version.ts';

export type Vec3Tuple = [number, number, number];

/** One raw reading from the phone, exactly as the browser reported it. */
export interface SensorSample {
  /** Monotonic counter per connection. */
  seq: number;
  /** Phone time in milliseconds (performance.now on the phone). */
  t: number;
  /** devicemotion.acceleration (m/s², without gravity), or null if missing. */
  accel: Vec3Tuple | null;
  /** devicemotion.accelerationIncludingGravity (m/s²). */
  accelG: Vec3Tuple | null;
  /** devicemotion.rotationRate alpha, beta, gamma (deg/s). */
  rot: Vec3Tuple | null;
  /** deviceorientation alpha, beta, gamma (deg). */
  orient: Vec3Tuple | null;
}

export const SAMPLE_TYPE = 1;
/** Fixed binary size of a sample message (bytes). */
export const SAMPLE_BYTES = 64;

const F_ACCEL = 1;
const F_ACCEL_G = 2;
const F_ROT = 4;
const F_ORIENT = 8;
/** Phone time is sent in units of 0.1 ms, wrapping at 2^32 (about five days). */
const TIME_SCALE = 10;
const TIME_WRAP = 2 ** 32;

/**
 * Layout (little endian):
 *   0 u8  type (1)          1 u8  protocol version    2 u16 flags
 *   4 u32 seq               8 u32 phone time (0.1 ms) 12 u32 slot key
 *  16 f32×3 accel          28 f32×3 accelG           40 f32×3 rotationRate
 *  52 f32×3 orientation    = 64 bytes
 */
export function encodeSample(s: SensorSample, key: number, out = new ArrayBuffer(SAMPLE_BYTES)): ArrayBuffer {
  const v = new DataView(out);
  let flags = 0;
  if (s.accel) flags |= F_ACCEL;
  if (s.accelG) flags |= F_ACCEL_G;
  if (s.rot) flags |= F_ROT;
  if (s.orient) flags |= F_ORIENT;
  v.setUint8(0, SAMPLE_TYPE);
  v.setUint8(1, PROTOCOL_VERSION);
  v.setUint16(2, flags, true);
  v.setUint32(4, s.seq >>> 0, true);
  v.setUint32(8, Math.round(s.t * TIME_SCALE) % TIME_WRAP, true);
  v.setUint32(12, key >>> 0, true);
  writeVec(v, 16, s.accel);
  writeVec(v, 28, s.accelG);
  writeVec(v, 40, s.rot);
  writeVec(v, 52, s.orient);
  return out;
}

export interface DecodedSample {
  sample: SensorSample;
  key: number;
}

/** Returns null for anything that is not a valid sample of this protocol version. */
export function decodeSample(buf: ArrayBuffer): DecodedSample | null {
  if (buf.byteLength !== SAMPLE_BYTES) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== SAMPLE_TYPE || v.getUint8(1) !== PROTOCOL_VERSION) return null;
  const flags = v.getUint16(2, true);
  return {
    key: v.getUint32(12, true),
    sample: {
      seq: v.getUint32(4, true),
      t: v.getUint32(8, true) / TIME_SCALE,
      accel: flags & F_ACCEL ? readVec(v, 16) : null,
      accelG: flags & F_ACCEL_G ? readVec(v, 28) : null,
      rot: flags & F_ROT ? readVec(v, 40) : null,
      orient: flags & F_ORIENT ? readVec(v, 52) : null,
    },
  };
}

function writeVec(v: DataView, at: number, a: Vec3Tuple | null): void {
  v.setFloat32(at, a ? a[0] : 0, true);
  v.setFloat32(at + 4, a ? a[1] : 0, true);
  v.setFloat32(at + 8, a ? a[2] : 0, true);
}

function readVec(v: DataView, at: number): Vec3Tuple {
  return [v.getFloat32(at, true), v.getFloat32(at + 4, true), v.getFloat32(at + 8, true)];
}

/** Phone timestamps wrap at 2^32 × 0.1 ms; this undoes the wrap relative to a reference. */
export function unwrapTime(t: number, reference: number): number {
  const period = TIME_WRAP / TIME_SCALE;
  let x = t;
  while (x - reference > period / 2) x -= period;
  while (reference - x > period / 2) x += period;
  return x;
}

/** 32-bit FNV-1a hash of a slot token; sent with each sample instead of the token. */
export function tokenKey(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
