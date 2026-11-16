import { PROTOCOL_VERSION } from './version.ts';

/** Slots are 0 (player 1) and 1 (player 2). */
export type Slot = 0 | 1;

export type CommandName = 'serve' | 'calibrate';

/** Messages from the phone, sent on the reliable "commands" channel. */
export type PhoneMessage =
  | {
      t: 'hello';
      v: number;
      room: string;
      /** Requested slot; null lets the game pick a free one (manual code entry). */
      slot: Slot | null;
      /** Slot token from the QR code; null for manual code entry. */
      token: string | null;
      clientId: string;
      ua: string;
    }
  | { t: 'cmd'; id: string; cmd: CommandName }
  | { t: 'pong'; id: number; phoneTime: number }
  | { t: 'trace'; part: number; total: number; label: string; device: string; samples: unknown[] }
  | { t: 'diag'; rate: number; skipped: number };

export type RejectReason = 'version' | 'room' | 'token' | 'taken' | 'full';

export interface PhoneState {
  paused: boolean;
  phase: 'lobby' | 'serveReady' | 'toss' | 'inPlay' | 'pointOver' | 'matchOver';
  myServe: boolean;
  score: [number, number];
}

/** Messages from the game to the phone. */
export type GameMessage =
  | { t: 'welcome'; v: number; slot: Slot; token: string; key: number }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'ack'; id: string }
  | { t: 'ping'; id: number }
  | { t: 'net'; rtt: number; conn: ConnectionKind; dropped: number }
  | { t: 'state'; state: PhoneState }
  | { t: 'hit' }
  | { t: 'record'; seconds: number; label: string };

/** How the direct connection was established (from ICE candidate types). */
export type ConnectionKind = 'local' | 'public' | 'relay' | 'unknown';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isSlot = (x: unknown): x is Slot => x === 0 || x === 1;

/** Parses and validates a phone message. Unknown or malformed input gives null. */
export function parsePhoneMessage(raw: string): PhoneMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'hello':
      if (
        typeof m.v === 'number' &&
        typeof m.room === 'string' &&
        (m.slot === null || isSlot(m.slot)) &&
        (m.token === null || typeof m.token === 'string') &&
        typeof m.clientId === 'string' &&
        typeof m.ua === 'string'
      )
        return m as PhoneMessage;
      return null;
    case 'cmd':
      return typeof m.id === 'string' && (m.cmd === 'serve' || m.cmd === 'calibrate') ? (m as PhoneMessage) : null;
    case 'pong':
      return typeof m.id === 'number' && typeof m.phoneTime === 'number' ? (m as PhoneMessage) : null;
    case 'trace':
      return typeof m.part === 'number' && typeof m.total === 'number' && Array.isArray(m.samples)
        ? (m as PhoneMessage)
        : null;
    case 'diag':
      return typeof m.rate === 'number' && typeof m.skipped === 'number' ? (m as PhoneMessage) : null;
    default:
      return null;
  }
}

export function parseGameMessage(raw: string): GameMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || typeof m.t !== 'string') return null;
  const known = ['welcome', 'reject', 'ack', 'ping', 'net', 'state', 'hit', 'record'];
  return known.includes(m.t) ? (m as GameMessage) : null;
}

export const isCurrentVersion = (v: number): boolean => v === PROTOCOL_VERSION;
