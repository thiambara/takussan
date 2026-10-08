import { describe, expect, it } from 'vitest';

import { demainIso, etatEcheance, SEUIL_ECHEANCE_PROCHE_JOURS } from '../kyc-echeance';

/**
 * TCK-601 (C) — l'état d'une échéance KYC. Les bornes sont celles du ticket : le jour même est
 * EXPIRÉ (le dossier repasse `pending` ce jour-là), « bientôt » vaut moins de trente jours.
 */
describe('etatEcheance', () => {
  // 8 octobre 2026, 10 h locale.
  const maintenant = new Date(2026, 9, 8, 10, 0, 0);

  it.each([
    ['2026-10-07', 'expired'],
    ['2026-10-08', 'expired'],
    ['2026-10-09', 'soon'],
    ['2026-11-06', 'soon'],
    ['2026-11-07', 'valid'],
    ['2027-04-01', 'valid'],
  ] as const)('%s → %s', (valeur, attendu) => {
    expect(etatEcheance(valeur, maintenant)).toBe(attendu);
  });

  it('le seuil est bien de trente jours (le 30e jour n’est plus « bientôt »)', () => {
    expect(SEUIL_ECHEANCE_PROCHE_JOURS).toBe(30);
  });

  it('lit aussi un horodatage ISO (échéance du dossier)', () => {
    expect(etatEcheance('2026-10-20T00:00:00+00:00', maintenant)).toBe('soon');
    expect(etatEcheance('2026-01-01T00:00:00Z', maintenant)).toBe('expired');
  });

  it('rien, ou une valeur illisible, ne rend aucun état', () => {
    expect(etatEcheance(null, maintenant)).toBeNull();
    expect(etatEcheance(undefined, maintenant)).toBeNull();
    expect(etatEcheance('', maintenant)).toBeNull();
    expect(etatEcheance('pas une date', maintenant)).toBeNull();
  });

  it('demainIso rend la première date recevable au dépôt', () => {
    expect(demainIso(maintenant)).toBe('2026-10-09');
    expect(demainIso(new Date(2026, 11, 31))).toBe('2027-01-01');
  });
});
