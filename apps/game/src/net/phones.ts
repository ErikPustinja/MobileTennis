import { reactive } from 'vue';
import {
  GameHost,
  hasRelay,
  loadIceServers,
  PUBLIC_SIGNALING,
  type HostState,
  type PairingError,
  type SignalingConfig,
  type SlotInfo,
  type SlotStats,
} from '@mobitenis/net';
import type { GameMessage, PhoneState, SensorTrace, Slot } from '@mobitenis/protocol';
import { GestureRecognizer } from '@mobitenis/sim';
import { PhoneInput } from '../input/phone.ts';

export interface SlotView {
  status: SlotInfo['status'];
  url: string;
  ua: string;
  stats: SlotStats | null;
}

export interface HubView {
  state: HostState;
  error: PairingError | null;
  room: string;
  slots: [SlotView, SlotView];
  /** Whether a TURN relay is configured (null while loading). */
  relay: boolean | null;
}

export interface HubConfig {
  signaling: SignalingConfig;
  ice: Promise<RTCIceServer[]>;
  /** Absolute URL of the controller page (ends with "/"). */
  controllerUrl: string;
  /** Extra hash parameters for the controller (test setups). */
  passthrough: string;
  /** `?maxage=` override of the 100 ms sample age limit (slow test machines only). */
  maxSampleAgeMs?: number;
}

/** Reads `?signal=ws://…`, `?stun=none` and `?controller=URL` from the game URL. */
export function hubConfigFromLocation(loc: Location = location): HubConfig {
  const q = new URLSearchParams(loc.search);
  const signal = q.get('signal');
  const pass = new URLSearchParams();
  if (signal) pass.set('sig', signal);
  if (q.get('stun') === 'none') pass.set('stun', 'none');
  const base = `${loc.origin}${loc.pathname.replace(/[^/]*$/, '')}`;
  return {
    signaling: signal ? { url: signal, key: 'peerjs' } : PUBLIC_SIGNALING,
    // `?stun=none` (tests) uses no ICE servers at all; otherwise STUN plus the TURN relay, if configured.
    ice: q.get('stun') === 'none' ? Promise.resolve([]) : loadIceServers(import.meta.env.VITE_TURN_CREDENTIALS_URL || undefined),
    controllerUrl: q.get('controller') ?? new URL('c/', base).href,
    passthrough: pass.toString(),
    ...(Number(q.get('maxage')) > 0 ? { maxSampleAgeMs: Number(q.get('maxage')) } : {}),
  };
}

/** Owns pairing for both slots and exposes a small reactive view for the UI. */
export class PhoneHub {
  readonly host: GameHost;
  readonly inputs: [PhoneInput, PhoneInput] = [new PhoneInput(0), new PhoneInput(1)];
  readonly view: HubView;
  private readonly cfg: HubConfig;
  onStatus: ((slot: Slot, status: SlotInfo['status']) => void) | null = null;
  onServe: ((slot: Slot) => void) | null = null;
  onTrace: ((slot: Slot, trace: SensorTrace) => void) | null = null;

  constructor(cfg: HubConfig) {
    this.cfg = cfg;
    this.host = new GameHost({
      signaling: cfg.signaling,
      ice: cfg.ice,
      ...(cfg.maxSampleAgeMs ? { maxSampleAgeMs: cfg.maxSampleAgeMs } : {}),
    });
    this.view = reactive({
      state: this.host.state,
      error: this.host.error,
      room: this.host.room,
      slots: [this.slotView(0), this.slotView(1)],
      relay: null,
    }) as HubView;
    void cfg.ice.then((servers) => {
      this.view.relay = hasRelay(servers);
    });
    this.host.on('sample', (slot, s) => this.inputs[slot].push(s));
    this.host.on('command', (slot, cmd) => {
      if (cmd === 'calibrate') this.inputs[slot].calibrate();
      if (cmd === 'serve') this.onServe?.(slot);
    });
    this.host.on('status', (slot, info) => {
      this.view.slots[slot] = this.slotView(slot);
      if (info.status === 'connected') this.inputs[slot].recognizer = new GestureRecognizer();
      this.onStatus?.(slot, info.status);
    });
    this.host.on('trace', (slot, trace) => this.onTrace?.(slot, trace));
    this.host.onStateChange(() => {
      this.view.state = this.host.state;
      this.view.error = this.host.error;
      this.view.room = this.host.room;
      this.view.slots = [this.slotView(0), this.slotView(1)];
    });
  }

  connected(slot: Slot): boolean {
    return this.host.core.slots[slot].status === 'connected';
  }

  /** Controller link with room, slot and the slot's one-time token. */
  urlFor(slot: Slot): string {
    const info = this.host.core.slots[slot];
    const hash = new URLSearchParams({ r: this.host.room, s: String(slot), t: info.token });
    return `${this.cfg.controllerUrl}#${hash.toString()}${this.cfg.passthrough ? `&${this.cfg.passthrough}` : ''}`;
  }

  send(slot: Slot, msg: GameMessage): void {
    this.host.core.send(slot, msg);
  }

  sendState(slot: Slot, state: PhoneState): void {
    if (this.connected(slot)) this.send(slot, { t: 'state', state });
  }

  requestRecording(slot: Slot, seconds: number, label: string): void {
    this.send(slot, { t: 'record', seconds, label });
  }

  /** Refreshes the diagnostics part of the view (call while it is visible). */
  refreshStats(): void {
    for (const slot of [0, 1] as const) {
      this.view.slots[slot].stats = { ...this.host.core.slots[slot].stats };
    }
  }

  private slotView(slot: Slot): SlotView {
    const info = this.host.core.slots[slot];
    return { status: info.status, url: this.urlFor(slot), ua: info.ua, stats: null };
  }
}
