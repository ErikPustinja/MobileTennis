import { describe, expect, it } from 'vitest';
import { STUN_SERVERS, hasRelay, loadIceServers } from './ice.ts';

const respond = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('ICE servers', () => {
  it('uses only STUN without a TURN URL', async () => {
    expect(await loadIceServers(undefined)).toEqual(STUN_SERVERS);
  });

  it('adds the TURN relay returned by the credentials URL', async () => {
    const turn = { urls: 'turn:global.relay.metered.ca:80', username: 'u', credential: 'c' };
    const servers = await loadIceServers('https://x.example/creds', respond([turn, { nonsense: true }]));
    expect(servers).toEqual([...STUN_SERVERS, turn]);
    expect(hasRelay(servers)).toBe(true);
  });

  it('falls back to STUN if the credentials service fails', async () => {
    expect(await loadIceServers('https://x.example/creds', respond({}, false))).toEqual(STUN_SERVERS);
    const broken = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await loadIceServers('https://x.example/creds', broken)).toEqual(STUN_SERVERS);
    expect(hasRelay(STUN_SERVERS)).toBe(false);
  });
});
