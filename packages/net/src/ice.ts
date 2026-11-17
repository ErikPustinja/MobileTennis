/** Public STUN servers (free): find each device's public address. */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Metered Open Relay "static auth" TURN server: a public shared secret, no
 * account needed (https://metered.ca/tools/openrelay/). Credentials follow
 * the standard TURN REST scheme: username = "<expiry unix time>:<id>",
 * password = base64(HMAC-SHA1(secret, username)).
 */
export const OPEN_RELAY = {
  host: 'staticauth.openrelay.metered.ca',
  secret: 'openrelayprojectsecret',
  /** Credential lifetime (s). */
  ttl: 24 * 3600,
} as const;

export async function openRelayServers(now = Date.now(), id = 'mobitenis'): Promise<RTCIceServer[]> {
  const username = `${Math.floor(now / 1000) + OPEN_RELAY.ttl}:${id}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(OPEN_RELAY.secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
  const credential = btoa(String.fromCharCode(...sig));
  const h = OPEN_RELAY.host;
  return [
    {
      urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443`, `turns:${h}:443?transport=tcp`],
      username,
      credential,
    },
  ];
}

/**
 * ICE servers for a connection. Direct paths (same Wi-Fi, or through public
 * addresses) are always tried first; a TURN relay is only added as a
 * fallback so the phone can reach the game from any network (mobile data,
 * hotspots, networks that block direct traffic).
 *
 * `turnCredentialsUrl` is a URL that returns a JSON array of RTCIceServer
 * objects, e.g. Metered Open Relay's
 * `https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>`.
 * Without it, the public Open Relay static-auth server is used (no account).
 * If fetching credentials fails, the public relay is used as well.
 */
export async function loadIceServers(
  turnCredentialsUrl: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<RTCIceServer[]> {
  const fallback = async () => [...STUN_SERVERS, ...(await openRelayServers().catch(() => []))];
  if (!turnCredentialsUrl) return fallback();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchImpl(turnCredentialsUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return fallback();
    const data: unknown = await res.json();
    const turn = Array.isArray(data) ? data.filter(isIceServer) : [];
    return turn.length > 0 ? [...STUN_SERVERS, ...turn] : fallback();
  } catch {
    return fallback();
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
