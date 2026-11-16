import type { PointReason } from '@mobitenis/sim';

export const REASON_TEXT: Record<PointReason, string> = {
  'serve-own-side': 'Servis mora prvo odskočiti na tvojoj strani',
  'serve-not-over': 'Servis nije prešao na protivničku stranu',
  'serve-out': 'Servis u aut',
  'own-side': 'Loptica nije prešla mrežu',
  'double-bounce': 'Dva odskoka',
  'not-returned': 'Loptica nije vraćena',
  out: 'Aut',
  volley: 'Udarac prije odskoka',
  'double-hit': 'Dvostruki udarac',
};
