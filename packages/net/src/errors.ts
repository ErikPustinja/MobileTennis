import type { RejectReason } from '@mobitenis/protocol';

export type PairingError = 'offline' | 'signaling-unreachable' | 'signaling-lost' | 'ice-failed' | 'timeout';

/** Croatian explanation with a concrete next step, shown in the game and on the phone. */
export const PAIRING_ERROR_TEXT: Record<PairingError, string> = {
  offline: 'Nema internetske veze. Internet treba samo za uparivanje: spoji uređaj na internet pa pokušaj ponovno.',
  'signaling-unreachable':
    'Signalizacijski poslužitelj nije dostupan. Provjeri internet; ako radi, poslužitelj je možda privremeno nedostupan – pokušaj ponovno za minutu.',
  'signaling-lost': 'Veza sa signalizacijskim poslužiteljem je prekinuta. Pokušavam ponovno…',
  'ice-failed':
    'Izravna veza mobitela i računala nije uspjela. Spoji oba uređaja na isti Wi-Fi; ako jesu, vatrozid na računalu ili mreža možda blokira WebRTC (npr. gostujuća ili školska mreža, hotspot).',
  timeout: 'Spajanje traje predugo. Provjeri da su mobitel i računalo na istom Wi-Fiju pa pokušaj ponovno.',
};

export const REJECT_TEXT: Record<RejectReason, string> = {
  version: 'Igra i kontroler su različitih verzija. Osvježi stranicu na računalu i na mobitelu.',
  room: 'Soba s tim kodom ne postoji. Provjeri kod na ekranu igre.',
  token: 'Ovaj QR kod više ne vrijedi. Skeniraj novi QR kod s ekrana igre.',
  taken: 'Ovo mjesto je zauzeo drugi mobitel. Skeniraj QR kod drugog igrača.',
  full: 'Oba mjesta su zauzeta.',
};
