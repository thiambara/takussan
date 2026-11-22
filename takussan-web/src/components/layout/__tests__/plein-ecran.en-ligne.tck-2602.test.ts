import { describe, expect, it } from 'vitest';

import { estPleinEcran, porteLaBarreDOnglets } from '../plein-ecran';

/**
 * TCK-2602 — « Votre annonce est en ligne » est plein écran (la coque d'entrée), la fiche du bien non :
 * le motif est ancré des deux côtés.
 */
describe('TCK-2602 — l’écran « en ligne » est plein écran', () => {
  it.each([
    ['/app/properties/42/en-ligne', true],
    ['/app/properties/new', true],
    ['/app/properties/42', false],
    ['/app/properties/42/en-ligne/plus', false],
    ['/app/properties/abc/en-ligne', false],
    ['/x/app/properties/42/en-ligne', false],
  ] as const)('%s → %s', (chemin, attendu) => {
    expect(estPleinEcran(chemin)).toBe(attendu);
  });

  it('sans barre d’onglets', () => {
    expect(porteLaBarreDOnglets('/app/properties/42/en-ligne')).toBe(false);
  });
});
