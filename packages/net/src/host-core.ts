import {
  PROTOCOL_VERSION,
  decodeSample,
  isTrace,
  parsePhoneMessage,
  tokenKey,
  unwrapTime,
  type CommandName,
  type ConnectionKind,
  type GameMessage,
  type PhoneMessage,
  type SensorSample,
  type SensorTrace,
  type Slot,
} from '@mobitenis/protocol';
import { ClockSync, SampleGate } from './clock.ts';
import { newToken } from './ids.ts';
import type { Link } from './link.ts';

export type SlotStatus = 'free' | 'connected' | 'reserved';

export interface AxisRange {
  min: number;
  max: number;
}

export interface SlotStats {
  received: number;
  accepted: number;
  droppedStale: number;
  droppedOrder: number;
  droppedKey: number;
  /** Accepted samples per second over the last full second. */
  rate: number;
  /** Phone-side samples skipped because the channel was backed up. */
  phoneSkipped: number;
  /** Sample rate measured on the phone. */
  phoneRate: number;
  rtt: number | null;
  conn: ConnectionKind;
  /** Min/max per axis over the last window: accel x,y,z, rot a,b,g, orient a,b,g. */
  ranges: Record<string, AxisRange>;
  missing: string[];
}

export interface SlotInfo {
  slot: Slot;
  token: string;
  key: number;
  status: SlotStatus;
  clientId: string | null;
  ua: string;
  link: Link | null;
  reservedUntil: number;
  stats: SlotStats;
}

export interface HostCoreOptions {
  room: string;
  now: () => number;
  /** How long a disconnected phone keeps its slot (ms). */
  reserveMs?: number;
  /** Phones must say hello within this time after the channels open (ms). */
  helloTimeoutMs?: number;
  maxSampleAgeMs?: number;
  pingIntervalMs?: number;
  makeToken?: () => string;
}

export interface HostEvents {
  sample: (slot: Slot, sample: SensorSample) => void;
  command: (slot: Slot, cmd: CommandName) => void;
  status: (slot: Slot, info: SlotInfo) => void;
  trace: (slot: Slot, trace: SensorTrace) => void;
}

const emptyStats = (): SlotStats => ({
  received: 0,
  accepted: 0,
  droppedStale: 0,
  droppedOrder: 0,
  droppedKey: 0,
  rate: 0,
  phoneSkipped: 0,
  phoneRate: 0,
  rtt: null,
  conn: 'unknown',
  ranges: {},
  missing: [],
});

interface PendingLink {
  link: Link;
  since: number;
}

interface SlotRuntime {
  clock: ClockSync;
  gate: SampleGate;
  seenCommands: string[];
  pingId: number;
  pingSent: Map<number, number>;
  lastPingAt: number;
  windowStart: number;
  windowCount: number;
  rangeAcc: Record<string, AxisRange>;
  missingAcc: Set<string>;
  lastPhoneT: number;
  traceParts: unknown[][];
}

const AXES = ['accel', 'accelG', 'rot', 'orient'] as const;
const AXIS_NAMES = ['x', 'y', 'z'];

/**
 * Game-side room logic, independent of WebRTC: slots and tokens, hello and
 * reconnect, command de-duplication, ping and clock sync, sample gating and
 * per-slot diagnostics.
 */
export class HostCore {
  readonly room: string;
  readonly slots: [SlotInfo, SlotInfo];
  private readonly rt: [SlotRuntime, SlotRuntime];
  private readonly pending = new Map<string, PendingLink>();
  private readonly opts: Required<HostCoreOptions>;
  private readonly handlers: Partial<HostEvents> = {};

  constructor(opts: HostCoreOptions) {
    this.opts = {
      reserveMs: 30_000,
      helloTimeoutMs: 5_000,
      maxSampleAgeMs: 100,
      pingIntervalMs: 1_000,
      makeToken: newToken,
      ...opts,
    };
    this.room = opts.room;
    this.slots = [this.freshSlot(0), this.freshSlot(1)];
    this.rt = [this.freshRuntime(), this.freshRuntime()];
  }

  on<K extends keyof HostEvents>(event: K, fn: HostEvents[K]): void {
    this.handlers[event] = fn;
  }

  /** A new link whose channels are open; it must identify itself with hello. */
  attach(link: Link): void {
    this.pending.set(link.id, { link, since: this.opts.now() });
    link.onText = (text) => this.onText(link, text);
    link.onBinary = (data) => this.onBinary(link, data);
    link.onClose = () => this.onClose(link);
  }

  send(slot: Slot, msg: GameMessage): void {
    this.slots[slot].link?.sendText(JSON.stringify(msg));
  }

  broadcast(msg: GameMessage): void {
    for (const s of this.slots) if (s.status === 'connected') this.send(s.slot, msg);
  }

  /** Call regularly (a few times per second): pings, timeouts, rates. */
  tick(): void {
    const now = this.opts.now();
    for (const [id, p] of this.pending) {
      if (now - p.since > this.opts.helloTimeoutMs) {
        this.pending.delete(id);
        p.link.close();
      }
    }
    for (const info of this.slots) {
      const rt = this.rt[info.slot];
      if (info.status === 'reserved' && now >= info.reservedUntil) this.release(info.slot);
      if (info.status !== 'connected') continue;
      if (now - rt.lastPingAt >= this.opts.pingIntervalMs) {
        rt.lastPingAt = now;
        const id = ++rt.pingId;
        rt.pingSent.set(id, now);
        if (rt.pingSent.size > 20) rt.pingSent.delete(rt.pingSent.keys().next().value as number);
        this.send(info.slot, { t: 'ping', id });
      }
      if (now - rt.windowStart >= 1000) {
        info.stats.rate = (rt.windowCount * 1000) / (now - rt.windowStart);
        info.stats.ranges = rt.rangeAcc;
        info.stats.missing = [...rt.missingAcc];
        rt.windowStart = now;
        rt.windowCount = 0;
        rt.rangeAcc = {};
        rt.missingAcc = new Set();
      }
    }
  }

  /** Drops a slot's current link as if the network failed (tests, diagnostics). */
  dropLink(slot: Slot): void {
    this.slots[slot].link?.close();
  }

  private freshSlot(slot: Slot): SlotInfo {
    const token = this.opts.makeToken();
    return {
      slot,
      token,
      key: tokenKey(token),
      status: 'free',
      clientId: null,
      ua: '',
      link: null,
      reservedUntil: 0,
      stats: emptyStats(),
    };
  }

  private freshRuntime(): SlotRuntime {
    return {
      clock: new ClockSync(),
      gate: new SampleGate(this.opts?.maxSampleAgeMs ?? 100),
      seenCommands: [],
      pingId: 0,
      pingSent: new Map(),
      lastPingAt: 0,
      windowStart: 0,
      windowCount: 0,
      rangeAcc: {},
      missingAcc: new Set(),
      lastPhoneT: 0,
      traceParts: [],
    };
  }

  private release(slot: Slot): void {
    this.slots[slot] = this.freshSlot(slot);
    this.rt[slot] = this.freshRuntime();
    this.emitStatus(slot);
  }

  private emitStatus(slot: Slot): void {
    this.handlers.status?.(slot, this.slots[slot]);
  }

  private slotOf(link: Link): Slot | null {
    for (const s of this.slots) if (s.link === link) return s.slot;
    return null;
  }

  private onText(link: Link, text: string): void {
    const msg = parsePhoneMessage(text);
    if (!msg) return;
    if (msg.t === 'hello') {
      this.onHello(link, msg);
      return;
    }
    const slot = this.slotOf(link);
    if (slot === null) return; // not authenticated: ignore everything else
    const rt = this.rt[slot];
    const info = this.slots[slot];
    switch (msg.t) {
      case 'cmd': {
        this.send(slot, { t: 'ack', id: msg.id });
        if (rt.seenCommands.includes(msg.id)) return; // resent after reconnect: run once
        rt.seenCommands.push(msg.id);
        if (rt.seenCommands.length > 64) rt.seenCommands.shift();
        this.handlers.command?.(slot, msg.cmd);
        return;
      }
      case 'pong': {
        const sent = rt.pingSent.get(msg.id);
        if (sent === undefined) return;
        rt.pingSent.delete(msg.id);
        const rtt = rt.clock.add(sent, this.opts.now(), msg.phoneTime);
        info.stats.rtt = rtt;
        void link
          .connectionKind()
          .then((conn) => {
            info.stats.conn = conn;
          })
          .catch(() => {});
        this.send(slot, {
          t: 'net',
          rtt,
          conn: info.stats.conn,
          dropped: info.stats.droppedStale + info.stats.droppedOrder,
        });
        return;
      }
      case 'diag':
        info.stats.phoneRate = msg.rate;
        info.stats.phoneSkipped = msg.skipped;
        return;
      case 'trace': {
        rt.traceParts[msg.part] = msg.samples;
        const received = rt.traceParts.filter(Boolean).length;
        if (received === msg.total) {
          const trace = {
            format: 'mobitenis-trace',
            version: 1,
            label: msg.label,
            recordedAt: new Date().toISOString(),
            device: msg.device,
            samples: rt.traceParts.flat(),
          };
          rt.traceParts = [];
          if (isTrace(trace)) this.handlers.trace?.(slot, trace);
        }
        return;
      }
    }
  }

  private onHello(link: Link, msg: Extract<PhoneMessage, { t: 'hello' }>): void {
    const reject = (reason: 'version' | 'room' | 'token' | 'taken' | 'full') => {
      link.sendText(JSON.stringify({ t: 'reject', reason } satisfies GameMessage));
    };
    if (msg.v !== PROTOCOL_VERSION) return reject('version');
    if (msg.room !== this.room) return reject('room');

    let target: SlotInfo | undefined;
    if (msg.token !== null) {
      target = this.slots.find((s) => s.token === msg.token && (msg.slot === null || s.slot === msg.slot));
      if (!target) return reject('token');
      if (target.status !== 'free' && target.clientId !== msg.clientId) return reject('taken');
    } else {
      const sameClient = this.slots.find((s) => s.clientId === msg.clientId && s.status !== 'free');
      const wanted = msg.slot !== null ? this.slots[msg.slot] : undefined;
      target =
        sameClient ??
        (wanted && wanted.status === 'free' ? wanted : undefined) ??
        this.slots.find((s) => s.status === 'free');
      if (!target) return reject('full');
    }

    const previous = target.link;
    this.pending.delete(link.id);
    target.link = link;
    target.clientId = msg.clientId;
    target.ua = msg.ua;
    target.status = 'connected';
    target.reservedUntil = 0;
    const rt = this.rt[target.slot];
    rt.gate.reset();
    rt.clock.reset();
    rt.lastPingAt = 0;
    rt.windowStart = this.opts.now();
    rt.windowCount = 0;
    if (previous && previous !== link) {
      previous.onClose = null;
      previous.close();
    }
    this.send(target.slot, { t: 'welcome', v: PROTOCOL_VERSION, slot: target.slot, token: target.token, key: target.key });
    this.emitStatus(target.slot);
  }

  private onBinary(link: Link, data: ArrayBuffer): void {
    const slot = this.slotOf(link);
    if (slot === null) return;
    const info = this.slots[slot];
    const rt = this.rt[slot];
    info.stats.received++;
    const decoded = decodeSample(data);
    if (!decoded || decoded.key !== info.key) {
      info.stats.droppedKey++;
      return;
    }
    const s = decoded.sample;
    s.t = unwrapTime(s.t, rt.lastPhoneT || s.t);
    rt.lastPhoneT = s.t;
    const drop = rt.gate.check(s.seq, s.t, this.opts.now(), rt.clock.offset);
    if (drop === 'order') {
      info.stats.droppedOrder++;
      return;
    }
    if (drop === 'stale') {
      info.stats.droppedStale++;
      return;
    }
    info.stats.accepted++;
    rt.windowCount++;
    this.trackRanges(rt, s);
    this.handlers.sample?.(slot, s);
  }

  private trackRanges(rt: SlotRuntime, s: SensorSample): void {
    for (const axis of AXES) {
      const v = s[axis];
      if (!v) {
        rt.missingAcc.add(axis);
        continue;
      }
      for (let i = 0; i < 3; i++) {
        const name = `${axis}.${AXIS_NAMES[i]}`;
        const r = (rt.rangeAcc[name] ??= { min: Infinity, max: -Infinity });
        const x = v[i]!;
        if (x < r.min) r.min = x;
        if (x > r.max) r.max = x;
      }
    }
  }

  private onClose(link: Link): void {
    this.pending.delete(link.id);
    const slot = this.slotOf(link);
    if (slot === null) return;
    const info = this.slots[slot];
    info.link = null;
    info.status = 'reserved';
    info.reservedUntil = this.opts.now() + this.opts.reserveMs;
    this.emitStatus(slot);
  }
}
