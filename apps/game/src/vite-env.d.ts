/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL returning TURN credentials as RTCIceServer[] (set at build time; optional). */
  readonly VITE_TURN_CREDENTIALS_URL?: string;
}
