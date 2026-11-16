import type { ConnectionKind } from '@mobitenis/protocol';

/**
 * One phone connection as seen by the game: a reliable text channel and an
 * unreliable, unordered binary channel. WebRTC implements it in `rtc.ts`;
 * tests use in-memory fakes.
 */
export interface Link {
  readonly id: string;
  sendText(text: string): void;
  /** Returns false if the message was not sent. */
  sendBinary(data: ArrayBuffer): boolean;
  bufferedAmount(): number;
  close(): void;
  connectionKind(): Promise<ConnectionKind>;
  onText: ((text: string) => void) | null;
  onBinary: ((data: ArrayBuffer) => void) | null;
  onClose: (() => void) | null;
}
