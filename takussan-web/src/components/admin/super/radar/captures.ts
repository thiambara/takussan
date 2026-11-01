/**
 * TCK-2386 — les bornes d'un envoi de captures du Radar, jugées dans le navigateur AVANT l'envoi.
 *
 * - par fichier et en nombre : celles de l'API (`config('radar.captures')` : 10 fichiers, 8 192 Ko,
 *   JPEG/PNG/WebP) ;
 * - au total : l'image de l'API refuse toute requête au-delà de `post_max_size` (26 Mo,
 *   `takussan-api/docker/php.ini`), bien avant Laravel — 10 × 8 Mo n'y passeraient pas. 24 Mo
 *   laissent la marge de l'enveloppe multipart.
 *
 * Les trois sont épinglées par `src/lib/queries/__tests__/radar.tck-2386.test.ts`, qui relit les
 * deux fichiers de l'API.
 */
export const CAPTURES_ACCEPT = 'image/jpeg,image/png,image/webp';

export const CAPTURES_MAX_FICHIERS = 10;

const MIO = 1024 * 1024;

export const CAPTURE_MAX_OCTETS = 8 * MIO;

export const CAPTURES_TOTAL_MAX_OCTETS = 24 * MIO;

export type RefusCaptures = 'tooMany' | 'fileTooLarge' | 'totalTooLarge';

/** Ce qui empêche d'envoyer ces fichiers, ou `null`. */
export function refusCaptures(fichiers: readonly File[]): RefusCaptures | null {
  if (fichiers.length > CAPTURES_MAX_FICHIERS) return 'tooMany';
  if (fichiers.some((f) => f.size > CAPTURE_MAX_OCTETS)) return 'fileTooLarge';
  if (fichiers.reduce((total, f) => total + f.size, 0) > CAPTURES_TOTAL_MAX_OCTETS) return 'totalTooLarge';
  return null;
}
