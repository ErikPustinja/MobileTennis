import type { PairingError } from './errors.ts';
import { HostCore, type HostEvents } from './host-core.ts';
import { hostPeerId, newRoomCode } from './ids.ts';
import { DEFAULT_ICE, RtcLink, type RtcSignalPayload } from './rtc.ts';
import { PeerJsSignaling, PUBLIC_SIGNALING, SignalingError, type SignalMessage, type SignalingConfig } from './signaling.ts';

export interface GameHostOptions {
  signaling?: SignalingConfig;
  ice?: RTCIceServer[];
  now?: () => number;
  /** Fixed room code (tests); otherwise random. */
  room?: string;
}

export type HostState = 'starting' | 'ready' | 'error';

/**
 * The game's side of pairing: registers the room on the signalling server,
 * answers phones' WebRTC offers and hands open links to HostCore.
 */
export class GameHost {
  core: HostCore;
  state: HostState = 'starting';
  error: PairingError | null = null;
  private signaling: PeerJsSignaling | null = null;
  private readonly links = new Map<string, RtcLink>();
  private readonly opts: GameHostOptions;
  private readonly handlers: Partial<HostEvents> = {};
  private readonly stateListeners = new Set<() => void>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: GameHostOptions = {}) {
    this.opts = opts;
    this.core = this.makeCore(opts.room ?? newRoomCode());
    this.tickTimer = setInterval(() => this.core.tick(), 100);
    void this.connect(0);
  }

  get room(): string {
    return this.core.room;
  }

  on<K extends keyof HostEvents>(event: K, fn: HostEvents[K]): void {
    this.handlers[event] = fn;
    this.core.on(event, fn);
  }

  onStateChange(fn: () => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  stop(): void {
    this.stopped = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const l of this.links.values()) l.close();
    this.signaling?.close();
  }

  private makeCore(room: string): HostCore {
    const core = new HostCore({ room, now: this.opts.now ?? (() => performance.now()) });
    for (const [k, fn] of Object.entries(this.handlers)) core.on(k as keyof HostEvents, fn as never);
    return core;
  }

  private setState(state: HostState, error: PairingError | null): void {
    this.state = state;
    this.error = error;
    for (const fn of this.stateListeners) fn();
  }

  private async connect(attempt: number): Promise<void> {
    if (this.stopped) return;
    const sig = new PeerJsSignaling(this.opts.signaling ?? PUBLIC_SIGNALING, hostPeerId(this.core.room));
    this.signaling = sig;
    sig.onMessage = (m) => void this.onSignal(m);
    sig.onClose = () => {
      if (this.stopped) return;
      this.setState('error', 'signaling-lost');
      this.retry(1);
    };
    try {
      await sig.open();
      this.setState('ready', null);
    } catch (e) {
      const code = e instanceof SignalingError ? e.code : 'unreachable';
      if (code === 'id-taken' && attempt < 5) {
        this.core = this.makeCore(newRoomCode());
        void this.connect(attempt + 1);
        return;
      }
      this.setState('error', code === 'offline' ? 'offline' : 'signaling-unreachable');
      this.retry(attempt + 1);
    }
  }

  private retry(attempt: number): void {
    if (this.retryTimer || this.stopped) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect(attempt);
    }, 3_000);
  }

  private async onSignal(m: SignalMessage): Promise<void> {
    const src = m.src;
    const payload = m.payload as RtcSignalPayload | undefined;
    if (!src || !payload?.connectionId) return;
    const key = `${src}|${payload.connectionId}`;
    if (m.type === 'OFFER') {
      if (this.links.has(key)) return;
      try {
        const link = await RtcLink.answer(this.signaling!, src, payload, this.opts.ice ?? DEFAULT_ICE);
        this.links.set(key, link);
        link.onClose = () => this.links.delete(key);
        await link.ready;
        this.core.attach(link);
      } catch {
        this.links.get(key)?.close();
        this.links.delete(key);
      }
    } else if (m.type === 'CANDIDATE' || m.type === 'ANSWER') {
      await this.links.get(key)?.handleSignal(m.type, payload);
    }
  }
}
