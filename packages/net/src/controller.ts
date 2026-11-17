import {
  PROTOCOL_VERSION,
  encodeSample,
  parseGameMessage,
  SAMPLE_BYTES,
  type CommandName,
  type GameMessage,
  type PhoneMessage,
  type RejectReason,
  type SensorSample,
  type Slot,
} from '@mobitenis/protocol';
import type { PairingError } from './errors.ts';
import { hostPeerId, newClientId, randomString } from './ids.ts';
import { DEFAULT_ICE, RtcLink, SAMPLE_BUFFER_LIMIT, type RtcSignalPayload } from './rtc.ts';
import { PeerJsSignaling, PUBLIC_SIGNALING, SignalingError, type SignalingConfig } from './signaling.ts';

export type ControllerState =
  | { kind: 'idle' }
  | { kind: 'connecting'; attempt: number }
  | { kind: 'connected'; slot: Slot }
  | { kind: 'reconnecting'; attempt: number; error: PairingError | null }
  | { kind: 'rejected'; reason: RejectReason };

export interface ControllerOptions {
  room: string;
  slot: Slot | null;
  token: string | null;
  clientId?: string;
  signaling?: SignalingConfig;
  /** ICE servers, or a promise of them (TURN credentials are fetched at startup). */
  ice?: RTCIceServer[] | Promise<RTCIceServer[]>;
  ua?: string;
  /** Called when the game assigns or confirms a slot and token (to remember them). */
  onIdentity?: (slot: Slot, token: string) => void;
}

/** First reconnect attempt starts this soon after a drop (ms); spec: within 1 s. */
const RECONNECT_DELAY_MS = 250;
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Phone side of the connection: pairs through signalling, keeps a direct
 * WebRTC link, re-establishes it automatically and resends unacknowledged
 * commands so none is lost (the game runs each id only once).
 */
export class ControllerClient {
  state: ControllerState = { kind: 'idle' };
  readonly clientId: string;
  slot: Slot | null;
  token: string | null;
  /** Samples not sent because the channel was backed up. */
  skipped = 0;
  sent = 0;
  /** Last connection attempt, for the phone's diagnostics. */
  lastAttempt: { gathered: Record<string, number>; ice: string; error: PairingError | null } | null = null;
  private lastError: PairingError | null = null;
  private key = 0;
  private seq = 0;
  private link: RtcLink | null = null;
  private signaling: PeerJsSignaling | null = null;
  private readonly pending = new Map<string, CommandName>();
  private readonly opts: ControllerOptions;
  private readonly sampleBuf = new ArrayBuffer(SAMPLE_BYTES);
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onState: ((s: ControllerState) => void) | null = null;
  onMessage: ((m: GameMessage) => void) | null = null;

  constructor(opts: ControllerOptions) {
    this.opts = opts;
    this.clientId = opts.clientId ?? newClientId();
    this.slot = opts.slot;
    this.token = opts.token;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.link?.close();
    this.signaling?.close();
  }

  get connected(): boolean {
    return this.state.kind === 'connected';
  }

  /** Sends one sample on the unreliable channel; skipped while the buffer is backed up. */
  sendSample(sample: Omit<SensorSample, 'seq'>): boolean {
    const link = this.link;
    if (!link || this.state.kind !== 'connected') return false;
    if (link.bufferedAmount() > SAMPLE_BUFFER_LIMIT) {
      this.skipped++;
      return false;
    }
    const s: SensorSample = { ...sample, seq: this.seq++ };
    const ok = link.sendBinary(encodeSample(s, this.key, this.sampleBuf));
    if (ok) this.sent++;
    return ok;
  }

  /** Sends a raw, already encoded sample (tests use it to send stale data). */
  sendRawSample(sample: SensorSample, key = this.key): void {
    this.link?.sendBinary(encodeSample(sample, key));
  }

  get nextSeq(): number {
    return this.seq;
  }

  command(cmd: CommandName): void {
    const id = `${this.clientId}-${randomString(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
    this.pending.set(id, cmd);
    this.sendCommand(id, cmd);
  }

  send(msg: PhoneMessage): void {
    this.link?.sendText(JSON.stringify(msg));
  }

  /** Breaks the connection abruptly, as a network drop would (tests). */
  simulateDrop(): void {
    this.link?.close();
  }

  private sendCommand(id: string, cmd: CommandName): void {
    if (this.state.kind === 'connected') this.send({ t: 'cmd', id, cmd });
  }

  private setState(s: ControllerState): void {
    this.state = s;
    this.onState?.(s);
  }

  private async ensureSignaling(): Promise<PeerJsSignaling> {
    if (this.signaling?.isOpen) return this.signaling;
    this.signaling?.close();
    const id = `${hostPeerId(this.opts.room)}-c-${this.clientId}-${randomString(4, 'abcdefghijkmnopqrstuvwxyz')}`;
    const sig = new PeerJsSignaling(this.opts.signaling ?? PUBLIC_SIGNALING, id);
    this.signaling = sig;
    sig.onMessage = (m) => {
      const payload = m.payload as RtcSignalPayload | undefined;
      if (this.link && payload?.connectionId === this.link.id) void this.link.handleSignal(m.type, payload);
    };
    await sig.open();
    return sig;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.attempt++;
    // Keep showing the last error while retrying, so it does not flicker away.
    this.setState(
      this.attempt === 1
        ? { kind: 'connecting', attempt: 1 }
        : { kind: 'reconnecting', attempt: this.attempt, error: this.lastError },
    );
    let error: PairingError = 'timeout';
    try {
      const sig = await this.ensureSignaling();
      const connectionId = randomString(8, 'abcdefghijkmnopqrstuvwxyz23456789');
      const link = await RtcLink.offer(sig, hostPeerId(this.opts.room), connectionId, (await this.opts.ice) ?? DEFAULT_ICE);
      this.link = link;
      this.lastAttempt = { gathered: link.gathered, ice: 'new', error: null };
      link.pc.addEventListener('iceconnectionstatechange', () => {
        if (this.lastAttempt) this.lastAttempt.ice = link.pc.iceConnectionState;
      });
      link.onText = (t) => this.onText(t);
      link.onClose = () => this.onLinkClosed(link);
      await withTimeout(link.ready, CONNECT_TIMEOUT_MS);
      this.send({
        t: 'hello',
        v: PROTOCOL_VERSION,
        room: this.opts.room,
        slot: this.slot,
        token: this.token,
        clientId: this.clientId,
        ua: this.opts.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      });
      return;
    } catch (e) {
      if (e instanceof SignalingError) error = e.code === 'offline' ? 'offline' : 'signaling-unreachable';
      else if (e instanceof Error && e.message.startsWith('ice-')) error = 'ice-failed';
      this.link?.close();
    }
    this.scheduleReconnect(error);
  }

  private scheduleReconnect(error: PairingError | null): void {
    if (this.stopped || this.state.kind === 'rejected' || this.timer) return;
    this.lastError = error;
    if (this.lastAttempt) this.lastAttempt.error = error;
    this.setState({ kind: 'reconnecting', attempt: this.attempt, error });
    const delay = Math.min(RECONNECT_DELAY_MS * 2 ** Math.max(0, this.attempt - 2), 3_000);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }

  private onLinkClosed(link: RtcLink): void {
    if (link !== this.link) return;
    this.link = null;
    const wasConnected = this.state.kind === 'connected';
    if (wasConnected) this.attempt = 1;
    // Closing before the game ever said welcome means the direct path failed.
    this.scheduleReconnect(wasConnected ? null : 'ice-failed');
  }

  private onText(text: string): void {
    const msg = parseGameMessage(text);
    if (!msg) return;
    switch (msg.t) {
      case 'welcome':
        this.slot = msg.slot;
        this.token = msg.token;
        this.key = msg.key;
        this.seq = 0;
        this.attempt = 0;
        this.lastError = null;
        this.opts.onIdentity?.(msg.slot, msg.token);
        this.setState({ kind: 'connected', slot: msg.slot });
        for (const [id, cmd] of this.pending) this.sendCommand(id, cmd);
        break;
      case 'reject':
        this.setState({ kind: 'rejected', reason: msg.reason });
        this.link?.close();
        break;
      case 'ack':
        this.pending.delete(msg.id);
        break;
      case 'ping':
        this.send({ t: 'pong', id: msg.id, phoneTime: performance.now() });
        break;
    }
    this.onMessage?.(msg);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
