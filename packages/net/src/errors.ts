import type { RejectReason } from '@mobitenis/protocol';

export type PairingError = 'offline' | 'signaling-unreachable' | 'signaling-lost' | 'ice-failed' | 'timeout';

/** Croatian explanation with a concrete next step, shown in the game and on the phone. */
export const PAIRING_ERROR_TEXT: Record<PairingError, string> = {
  offline: 'Nema internetske veze. Internet treba samo za uparivanje: spoji uređaj na internet pa pokušaj ponovno.',
  'signaling-unreachable':
    'Signalizacijski poslužitelj nije dostupan. Provjeri internet; ako radi, poslužitelj je možda privremeno nedostupan – pokušaj ponovno za minutu.',
  'signaling-lost': 'Veza sa signalizacijskim poslužiteljem je prekinuta. Pokušavam ponovno…',
  'ice-failed':
    'Veza mobitela i računala nije uspjela. Provjeri internet na oba uređaja. Ako posrednik (TURN) nije postavljen, uređaji moraju biti na istoj mreži, a vatrozid na računalu ne smije blokirati preglednik.',
  timeout: 'Spajanje traje predugo. Provjeri da su mobitel i računalo na istom Wi-Fiju pa pokušaj ponovno.',
};

export const REJECT_TEXT: Record<RejectReason, string> = {
  version: 'Igra i kontroler su različitih verzija. Osvježi stranicu na računalu i na mobitelu.',
  room: 'Soba s tim kodom ne postoji. Provjeri kod na ekranu igre.',
  token: 'Ovaj QR kod više ne vrijedi. Skeniraj novi QR kod s ekrana igre.',
  taken: 'Ovo mjesto je zauzeo drugi mobitel. Skeniraj QR kod drugog igrača.',
  full: 'Oba mjesta su zauzeta.',
};
