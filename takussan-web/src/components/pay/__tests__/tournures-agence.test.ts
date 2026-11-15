import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';

/**
 * TCK-2505 (contre-vérification du 2026-11-09) — le nom de l'agence ne se colle à aucune préposition.
 *
 * « À régler auprès de Agence Teranga » est fautif, et une élision calculée sur le nom (« auprès d’Agence … ») ne
 * tient pas pour tous les noms (sigles, chiffres, « h » muet ou aspiré). Toute tournure du lien de paiement amène donc
 * `{agence}` en apposition (« votre agence, {agence} »), en sujet, ou derrière une étiquette (« Agence : {agence} »).
 */
const PREPOSITION_COLLEE = {
  fr: /(?:\bde|\bdu|\bà|\bau|\bchez|\bpar|\bpour|\bavec|d[’'])\s*\{agence\}/i,
  en: /\b(?:to|at|from|by|with|contact|ask)\s+\{agence\}/i,
} as const;

function tournuresAvecAgence(paiement: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(paiement).filter(
    (e): e is [string, string] => typeof e[1] === 'string' && e[1].includes('{agence}'),
  );
}

describe('lienPublic.paiement — le nom de l’agence vient sans préposition collée', () => {
  it.each([
    ['fr', fr.lienPublic.paiement],
    ['en', en.lienPublic.paiement],
  ] as const)('%s', (langue, paiement) => {
    const tournures = tournuresAvecAgence(paiement);
    // Le plancher : la garde porte bien sur les tournures qui nomment l'agence.
    expect(tournures.length).toBeGreaterThanOrEqual(8);
    expect(tournures.filter(([, texte]) => PREPOSITION_COLLEE[langue].test(texte))).toEqual([]);
  });
});
