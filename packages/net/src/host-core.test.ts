import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, encodeSample, type GameMessage, type PhoneMessage, type SensorSample } from '@mobitenis/protocol';
import { ClockSync, SampleGate } from './clock.ts';
import { HostCore } from './host-core.ts';
import type { Link } from './link.ts';
import { classifyPair } from './rtc.ts';

class FakeLink implements Link {
  static n = 0;
  readonly id = `l${FakeLink.n++}`;
  sent: GameMessage[] = [];
  closed = false;
  onText: ((t: string) => void) | null = null;
  onBinary: ((d: ArrayBuffer) => void) | null = null;
  onClose: (() => void) | null = null;
  sendText(t: string) {
    this.sent.push(JSON.parse(t) as GameMessage);
  }
  sendBinary() {
    return true;
  }
  bufferedAmount() {
    return 0;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onClose?.();
  }
  connectionKind() {
    return Promise.resolve('local' as const);
  }
  phone(msg: PhoneMessage) {
    this.onText?.(JSON.stringify(msg));
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

function setup() {
  let now = 1000;
  let tokenN = 0;
  const core = new HostCore({ room: 'ABCDE', now: () => now, makeToken: () => `tok${tokenN++}` });
  const commands: string[] = [];
  const samples: number[] = [];
  core.on('command', (slot, cmd) => commands.push(`${slot}:${cmd}`));
  core.on('sample', (slot, s) => samples.push(slot * 1000 + s.seq));
  const hello = (link: FakeLink, over: Partial<Extract<PhoneMessage, { t: 'hello' }>> = {}) => {
    core.attach(link);
    link.phone({ t: 'hello', v: PROTOCOL_VERSION, room: 'ABCDE', slot: 0, token: 'tok0', clientId: 'phoneA', ua: 'test', ...over });
  };
  return { core, commands, samples, hello, advance: (ms: number) => (now += ms), now: () => now };
}

const sample = (seq: number, t: number): SensorSample => ({ seq, t, accel: [0, 0, 0], accelG: [0, 9.8, 0], rot: [0, 0, 0], orient: [0, 0, 0] });

describe('HostCore', () => {
  it('accepts a phone with a valid token and rejects bad ones', () => {
    const { core, hello } = setup();
    const a = new FakeLink();
    hello(a);
    expect(a.last()).toMatchObject({ t: 'welcome', slot: 0, token: 'tok0' });
    expect(core.slots[0].status).toBe('connected');

    const wrongToken = new FakeLink();
    hello(wrongToken, { slot: 1, token: 'nope', clientId: 'phoneB' });
    expect(wrongToken.last()).toEqual({ t: 'reject', reason: 'token' });

    const oldVersion = new FakeLink();
    hello(oldVersion, { v: PROTOCOL_VERSION + 1 });
    expect(oldVersion.last()).toEqual({ t: 'reject', reason: 'version' });

    const wrongRoom = new FakeLink();
    hello(wrongRoom, { room: 'ZZZZZ' });
    expect(wrongRoom.last()).toEqual({ t: 'reject', reason: 'room' });

    const thief = new FakeLink();
    hello(thief, { clientId: 'phoneB' });
    expect(thief.last()).toEqual({ t: 'reject', reason: 'taken' });
  });

  it('ignores commands and samples from links that did not say hello', () => {
    const { core, commands, samples } = setup();
    const l = new FakeLink();
    core.attach(l);
    l.phone({ t: 'cmd', id: 'x', cmd: 'serve' });
    l.onBinary?.(encodeSample(sample(1, 1000), core.slots[0].key));
    expect(commands).toEqual([]);
    expect(samples).toEqual([]);
  });

  it('keeps the slot for 30 s after a drop and lets the same phone return', () => {
    const { core, hello, advance } = setup();
    const a = new FakeLink();
    hello(a);
    a.close();
    expect(core.slots[0].status).toBe('reserved');
    advance(10_000);
    core.tick();
    const back = new FakeLink();
    hello(back);
    expect(back.last()).toMatchObject({ t: 'welcome', slot: 0 });
    expect(core.slots[0].status).toBe('connected');
  });

  it('frees the slot with a new token after the reservation expires', () => {
    const { core, hello, advance } = setup();
    const a = new FakeLink();
    hello(a);
    a.close();
    advance(30_001);
    core.tick();
    expect(core.slots[0].status).toBe('free');
    expect(core.slots[0].token).not.toBe('tok0');
    const late = new FakeLink();
    hello(late);
    expect(late.last()).toEqual({ t: 'reject', reason: 'token' });
  });

  it('acks every command but runs each id once', () => {
    const { commands, hello } = setup();
    const a = new FakeLink();
    hello(a);
    a.phone({ t: 'cmd', id: 'c1', cmd: 'serve' });
    a.phone({ t: 'cmd', id: 'c1', cmd: 'serve' });
    a.phone({ t: 'cmd', id: 'c2', cmd: 'calibrate' });
    expect(commands).toEqual(['0:serve', '0:calibrate']);
    expect(a.sent.filter((m) => m.t === 'ack')).toHaveLength(3);
  });

  it('assigns a free slot for manual room-code entry', () => {
    const { core, hello } = setup();
    hello(new FakeLink());
    const b = new FakeLink();
    hello(b, { slot: null, token: null, clientId: 'phoneB' });
    expect(b.last()).toMatchObject({ t: 'welcome', slot: 1, token: core.slots[1].token });
    const c = new FakeLink();
    hello(c, { slot: null, token: null, clientId: 'phoneC' });
    expect(c.last()).toEqual({ t: 'reject', reason: 'full' });
  });

  it('drops out-of-order, stale and wrongly keyed samples', () => {
    const { core, samples, hello, advance, now } = setup();
    const a = new FakeLink();
    hello(a);
    const key = core.slots[0].key;
    // Clock sync: phone clock = game clock + 5000 ms.
    core.tick();
    const ping = a.sent.find((m) => m.t === 'ping') as { id: number };
    advance(10);
    a.phone({ t: 'pong', id: ping.id, phoneTime: now() - 5 + 5000 });
    const phoneNow = () => now() + 5000;

    a.onBinary?.(encodeSample(sample(1, phoneNow()), key));
    a.onBinary?.(encodeSample(sample(1, phoneNow()), key)); // same seq again
    a.onBinary?.(encodeSample(sample(0, phoneNow()), key)); // older seq
    a.onBinary?.(encodeSample(sample(2, phoneNow() - 300), key)); // 300 ms old
    a.onBinary?.(encodeSample(sample(3, phoneNow()), key + 1)); // wrong key
    a.onBinary?.(encodeSample(sample(4, phoneNow()), key));
    expect(samples).toEqual([1, 4]);
    const st = core.slots[0].stats;
    expect(st.droppedOrder).toBe(2);
    expect(st.droppedStale).toBe(1);
    expect(st.droppedKey).toBe(1);
    expect(st.rtt).toBe(10);
  });
});

describe('clock and gate', () => {
  it('picks the offset of the fastest round trip', () => {
    const c = new ClockSync();
    c.add(0, 100, 1000 + 50 + 30); // slow, skewed
    c.add(200, 210, 1000 + 205);
    expect(c.offset).toBe(1000);
  });

  it('accepts everything fresh before the clock is known', () => {
    const g = new SampleGate(100);
    expect(g.check(1, 0, 99999, null)).toBeNull();
    expect(g.check(1, 0, 99999, null)).toBe('order');
  });
});

describe('connection kind', () => {
  it('classifies candidate pairs', () => {
    expect(classifyPair({ candidateType: 'host' }, { candidateType: 'host' })).toBe('local');
    expect(classifyPair({ candidateType: 'host' }, { candidateType: 'prflx', address: '192.168.1.20' })).toBe('local');
    expect(classifyPair({ candidateType: 'srflx', address: '93.1.2.3' }, { candidateType: 'srflx', address: '93.1.2.4' })).toBe('public');
    expect(classifyPair({ candidateType: 'relay' }, { candidateType: 'host' })).toBe('relay');
  });
});
