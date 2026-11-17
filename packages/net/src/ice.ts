/** Public STUN servers (free): find each device's public address. */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * ICE servers for a connection. Direct paths (same Wi-Fi, or through public
 * addresses) are always tried first; a TURN relay is only added as a
 * fallback so the phone can reach the game from any network (mobile data,
 * hotspots, networks that block direct traffic).
 *
 * `turnCredentialsUrl` is a URL that returns a JSON array of RTCIceServer
 * objects, e.g. Metered Open Relay's
 * `https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>`.
 * If it is missing or unreachable, only STUN is used.
 */
export async function loadIceServers(
  turnCredentialsUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<RTCIceServer[]> {
  if (!turnCredentialsUrl) return STUN_SERVERS;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchImpl(turnCredentialsUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return STUN_SERVERS;
    const data: unknown = await res.json();
    const turn = Array.isArray(data) ? data.filter(isIceServer) : [];
    return [...STUN_SERVERS, ...turn];
  } catch {
    return STUN_SERVERS;
  }
}

function isIceServer(x: unknown): x is RTCIceServer {
  if (typeof x !== 'object' || x === null) return false;
  const urls = (x as RTCIceServer).urls;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'));
}

/** True if any configured server is a TURN relay. */
export const hasRelay = (servers: RTCIceServer[]): boolean =>
  servers.some((s) => [s.urls].flat().some((u) => u.startsWith('turn:') || u.startsWith('turns:')));
