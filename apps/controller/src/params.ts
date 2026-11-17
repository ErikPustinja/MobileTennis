import { loadIceServers, normalizeRoomCode, PUBLIC_SIGNALING, type SignalingConfig } from '@mobitenis/net';
import type { Slot } from '@mobitenis/protocol';

export interface LaunchParams {
  room: string | null;
  slot: Slot | null;
  token: string | null;
  signaling: SignalingConfig;
  ice: Promise<RTCIceServer[]>;
  /** Extra hash parameters to keep when building links (test setups). */
  passthrough: string;
}

/** Reads `#r=ROOM&s=0&t=TOKEN[&sig=ws://…][&stun=none]` from the QR link. */
export function readParams(hash = location.hash): LaunchParams {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const s = p.get('s');
  const sig = p.get('sig');
  const pass = new URLSearchParams();
  if (sig) pass.set('sig', sig);
  if (p.get('stun') === 'none') pass.set('stun', 'none');
  return {
    room: p.get('r') ? normalizeRoomCode(p.get('r')!) : null,
    slot: s === '0' ? 0 : s === '1' ? 1 : null,
    token: p.get('t'),
    signaling: sig ? { url: sig, key: 'peerjs' } : PUBLIC_SIGNALING,
    ice: p.get('stun') === 'none' ? Promise.resolve([]) : loadIceServers(import.meta.env.VITE_TURN_CREDENTIALS_URL || undefined),
    passthrough: pass.toString(),
  };
}

const KEY = 'mobitenis.controller';

export interface Remembered {
  room: string;
  slot: Slot;
  token: string;
  clientId: string;
}

/** The phone remembers its slot so a reload or a dropped connection returns to it. */
export function remember(r: Remembered): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private mode: reconnect still works while the page stays open */
  }
}

export function recall(room: string): Remembered | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Remembered | null;
    return r && r.room === room ? r : null;
  } catch {
    return null;
  }
}
