import type { ConnectionKind } from '@mobitenis/protocol';
import type { Link } from './link.ts';
import type { Signaling } from './signaling.ts';

/** Public STUN only; no TURN relay is configured. */
export const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export interface RtcSignalPayload {
  /** Distinguishes reconnect attempts from the same phone. */
  connectionId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

/** Bytes queued on the samples channel above which the phone skips sending. */
export const SAMPLE_BUFFER_LIMIT = 1024;

/**
 * A WebRTC peer connection with the two channels the protocol uses:
 *  - "samples": unordered, no retransmits (stale motion data is useless)
 *  - "commands": reliable and ordered
 */
export class RtcLink implements Link {
  readonly id: string;
  readonly pc: RTCPeerConnection;
  private samples: RTCDataChannel | null = null;
  private commands: RTCDataChannel | null = null;
  private readonly signaling: Signaling;
  private readonly remoteId: string;
  private readonly pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;
  onText: ((text: string) => void) | null = null;
  onBinary: ((data: ArrayBuffer) => void) | null = null;
  onClose: (() => void) | null = null;
  /** Resolves when both channels are open. */
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;

  private constructor(signaling: Signaling, remoteId: string, connectionId: string, ice: RTCIceServer[]) {
    this.signaling = signaling;
    this.remoteId = remoteId;
    this.id = connectionId;
    this.pc = new RTCPeerConnection({ iceServers: ice });
    this.ready = new Promise((res, rej) => {
      this.resolveReady = res;
      this.rejectReady = rej;
    });
    this.ready.catch(() => {});
    this.pc.onicecandidate = (e) => {
      this.signaling.send('CANDIDATE', this.remoteId, {
        connectionId: this.id,
        candidate: e.candidate ? e.candidate.toJSON() : null,
      } satisfies RtcSignalPayload);
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' || s === 'closed') this.shutdown(new Error(`ice-${s}`));
      // "disconnected" can recover by itself; the channels' close events decide.
    };
  }

  /** Phone side: creates the channels and sends an offer. */
  static async offer(signaling: Signaling, hostId: string, connectionId: string, ice: RTCIceServer[]): Promise<RtcLink> {
    const link = new RtcLink(signaling, hostId, connectionId, ice);
    link.bindSamples(link.pc.createDataChannel('samples', { ordered: false, maxRetransmits: 0 }));
    link.bindCommands(link.pc.createDataChannel('commands', { ordered: true }));
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    signaling.send('OFFER', hostId, { connectionId, sdp: link.pc.localDescription!.toJSON() } satisfies RtcSignalPayload);
    return link;
  }

  /** Game side: answers an offer and waits for the phone's channels. */
  static async answer(
    signaling: Signaling,
    phoneId: string,
    payload: RtcSignalPayload,
    ice: RTCIceServer[],
  ): Promise<RtcLink> {
    const link = new RtcLink(signaling, phoneId, payload.connectionId, ice);
    link.pc.ondatachannel = (e) => {
      if (e.channel.label === 'samples') link.bindSamples(e.channel);
      else if (e.channel.label === 'commands') link.bindCommands(e.channel);
    };
    await link.pc.setRemoteDescription(payload.sdp!);
    await link.flushCandidates();
    const answer = await link.pc.createAnswer();
    await link.pc.setLocalDescription(answer);
    signaling.send('ANSWER', phoneId, { connectionId: link.id, sdp: link.pc.localDescription!.toJSON() } satisfies RtcSignalPayload);
    return link;
  }

  /** Feeds an ANSWER or CANDIDATE that arrived over signalling. */
  async handleSignal(type: string, payload: RtcSignalPayload): Promise<void> {
    if (this.closed) return;
    if (type === 'ANSWER' && payload.sdp) {
      await this.pc.setRemoteDescription(payload.sdp);
      await this.flushCandidates();
    } else if (type === 'CANDIDATE' && payload.candidate) {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(payload.candidate).catch(() => {});
      else this.pendingCandidates.push(payload.candidate);
    }
  }

  sendText(text: string): void {
    if (this.commands?.readyState === 'open') this.commands.send(text);
  }

  sendBinary(data: ArrayBuffer): boolean {
    if (this.samples?.readyState !== 'open') return false;
    this.samples.send(data);
    return true;
  }

  bufferedAmount(): number {
    return this.samples?.bufferedAmount ?? 0;
  }

  close(): void {
    this.shutdown(new Error('closed'));
  }

  /**
   * Classifies the selected candidate pair: both ends on host/private
   * addresses = local network; a relay candidate = through a relay; anything
   * else = via public (NAT-mapped) addresses.
   */
  async connectionKind(): Promise<ConnectionKind> {
    const stats = await this.pc.getStats();
    let pairId: string | undefined;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId as string;
    });
    let pair: Record<string, unknown> | undefined;
    stats.forEach((r) => {
      if (r.type === 'candidate-pair' && (r.id === pairId || (!pairId && r.nominated && r.state === 'succeeded'))) pair = r;
    });
    if (!pair) return 'unknown';
    const local = stats.get(pair.localCandidateId as string) as Record<string, unknown> | undefined;
    const remote = stats.get(pair.remoteCandidateId as string) as Record<string, unknown> | undefined;
    return classifyPair(local, remote);
  }

  private bindSamples(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    this.samples = ch;
    ch.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this.onBinary?.(e.data);
    };
    ch.onopen = () => this.checkReady();
    ch.onclose = () => this.shutdown(new Error('channel-closed'));
  }

  private bindCommands(ch: RTCDataChannel): void {
    this.commands = ch;
    ch.onmessage = (e) => {
      if (typeof e.data === 'string') this.onText?.(e.data);
    };
    ch.onopen = () => this.checkReady();
    ch.onclose = () => this.shutdown(new Error('channel-closed'));
  }

  private checkReady(): void {
    if (this.samples?.readyState === 'open' && this.commands?.readyState === 'open') this.resolveReady();
  }

  private async flushCandidates(): Promise<void> {
    for (const c of this.pendingCandidates.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }

  private shutdown(reason: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectReady(reason);
    this.samples?.close();
    this.commands?.close();
    this.pc.close();
    this.onClose?.();
  }
}

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:|fd|fc|.*\.local$)/i;

export function classifyPair(
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown> | undefined,
): ConnectionKind {
  if (!local || !remote) return 'unknown';
  const types = [local.candidateType, remote.candidateType];
  if (types.includes('relay')) return 'relay';
  const isLocal = (c: Record<string, unknown>) => {
    const addr = String(c.address ?? c.ip ?? '');
    return c.candidateType === 'host' || (addr !== '' && PRIVATE.test(addr));
  };
  return isLocal(local) && isLocal(remote) ? 'local' : 'public';
}
