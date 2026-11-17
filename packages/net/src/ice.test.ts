import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { OPEN_RELAY, STUN_SERVERS, hasRelay, loadIceServers, openRelayServers } from './ice.ts';

const respond = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('ICE servers', () => {
  it('uses the public Open Relay without a configured URL', async () => {
    const servers = await loadIceServers(undefined);
    expect(servers.slice(0, STUN_SERVERS.length)).toEqual(STUN_SERVERS);
    expect(hasRelay(servers)).toBe(true);
  });

  it('computes standard TURN REST credentials for Open Relay', async () => {
    const now = 1_800_000_000_000;
    const [server] = await openRelayServers(now, 'test');
    const username = `${now / 1000 + OPEN_RELAY.ttl}:test`;
    expect(server!.username).toBe(username);
    expect(server!.credential).toBe(createHmac('sha1', OPEN_RELAY.secret).update(username).digest('base64'));
  });

  it('adds the TURN relay returned by the credentials URL', async () => {
    const turn = { urls: 'turn:global.relay.metered.ca:80', username: 'u', credential: 'c' };
    const servers = await loadIceServers('https://x.example/creds', respond([turn, { nonsense: true }]));
    expect(servers).toEqual([...STUN_SERVERS, turn]);
    expect(hasRelay(servers)).toBe(true);
  });

  it('falls back to the public relay if the credentials service fails', async () => {
    const isOpenRelay = (s: RTCIceServer[]) => [s.at(-1)!.urls].flat()[0]!.includes(OPEN_RELAY.host);
    expect(isOpenRelay(await loadIceServers('https://x.example/creds', respond({}, false)))).toBe(true);
    const broken = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(isOpenRelay(await loadIceServers('https://x.example/creds', broken))).toBe(true);
    expect(hasRelay(STUN_SERVERS)).toBe(false);
  });
});
