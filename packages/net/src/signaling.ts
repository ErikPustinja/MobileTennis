import { newToken } from './ids.ts';

/**
 * Minimal client for the PeerJS signalling server protocol
 * (https://github.com/peers/peerjs-server). Only used to exchange WebRTC
 * offers, answers and ICE candidates; no game data goes through it.
 * Swappable: anything with the same small interface works.
 */
export interface Signaling {
  readonly id: string;
  open(timeoutMs?: number): Promise<void>;
  send(type: 'OFFER' | 'ANSWER' | 'CANDIDATE' | 'LEAVE', dst: string, payload: unknown): void;
  close(): void;
  onMessage: ((msg: SignalMessage) => void) | null;
  onClose: (() => void) | null;
}

export interface SignalMessage {
  type: string;
  src?: string;
  dst?: string;
  payload?: unknown;
}

export interface SignalingConfig {
  /** WebSocket base URL of the server, ending in "/". */
  url: string;
  key: string;
}

/** Free public PeerJS server. */
export const PUBLIC_SIGNALING: SignalingConfig = { url: 'wss://0.peerjs.com/', key: 'peerjs' };

export class SignalingError extends Error {
  readonly code: 'offline' | 'unreachable' | 'id-taken' | 'server';

  constructor(code: SignalingError['code'], message: string = code) {
    super(message);
    this.code = code;
  }
}

const HEARTBEAT_MS = 5_000;

export class PeerJsSignaling implements Signaling {
  readonly id: string;
  /** Kept across reconnects so the server gives us the same id back. */
  private readonly token = newToken();
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly config: SignalingConfig;
  onMessage: ((msg: SignalMessage) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(config: SignalingConfig, id: string) {
    this.config = config;
    this.id = id;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  open(timeoutMs = 8_000): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.reject(new SignalingError('offline'));
    }
    this.close();
    const base = this.config.url.endsWith('/') ? this.config.url : `${this.config.url}/`;
    const url = `${base}peerjs?key=${encodeURIComponent(this.config.key)}&id=${encodeURIComponent(this.id)}&token=${this.token}&version=1.5.5`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const fail = (err: SignalingError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
        if (this.ws === ws) this.ws = null;
        reject(err);
      };
      const timer = setTimeout(() => fail(new SignalingError('unreachable', 'timeout')), timeoutMs);
      ws.onerror = () => fail(new SignalingError('unreachable'));
      ws.onclose = () => {
        if (!settled) fail(new SignalingError('unreachable'));
        else if (this.ws === ws) {
          this.stopHeartbeat();
          this.onClose?.();
        }
      };
      ws.onmessage = (ev) => {
        let msg: SignalMessage;
        try {
          msg = JSON.parse(String(ev.data)) as SignalMessage;
        } catch {
          return;
        }
        if (!settled) {
          if (msg.type === 'OPEN') {
            settled = true;
            clearTimeout(timer);
            this.startHeartbeat();
            resolve();
          } else if (msg.type === 'ID-TAKEN') fail(new SignalingError('id-taken'));
          else if (msg.type === 'ERROR') fail(new SignalingError('server', JSON.stringify(msg.payload)));
          return;
        }
        this.onMessage?.(msg);
      };
    });
  }

  send(type: 'OFFER' | 'ANSWER' | 'CANDIDATE' | 'LEAVE', dst: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, dst, payload }));
  }

  close(): void {
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
