/** Room codes avoid easily confused characters (0/O, 1/I/L). */
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

export function randomString(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const ROOM_CODE_LENGTH = 5;
export const newRoomCode = (): string => randomString(ROOM_CODE_LENGTH, ROOM_ALPHABET);
export const newToken = (): string => randomString(10, TOKEN_ALPHABET);
export const newClientId = (): string => randomString(12, TOKEN_ALPHABET);

export const normalizeRoomCode = (s: string): string =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);

/** Signalling peer id of the game for a room. */
export const hostPeerId = (room: string): string => `mobitenis-v1-${room}`;
