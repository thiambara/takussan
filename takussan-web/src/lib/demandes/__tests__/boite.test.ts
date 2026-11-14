/** TCK-2584 — les règles pures de la boîte « Demandes ». */
import { describe, it, expect } from 'vitest';
import { ageDeLaDemande, borneDuRetard, prenomDuDemandeur, DELAI_DE_RETARD_MS } from '../boite';

const MAINTENANT = new Date('2026-11-10T12:00:00Z');

describe('ageDeLaDemande', () => {
  it.each([
    ['2026-11-10T11:59:30Z', 'instant', 0, false],
    ['2026-11-10T11:35:00Z', 'minutes', 25, false],
    ['2026-11-10T09:00:00Z', 'heures', 3, false],
    ['2026-11-09T12:01:00Z', 'heures', 23, false],
    ['2026-11-02T08:47:00Z', 'jours', 8, true],
    // Les jours se comptent au calendrier de Dakar : reçue le 2 à 17:47, « 8 j » le 10 à midi.
    ['2026-11-02T17:47:00Z', 'jours', 8, true],
    ['2026-11-01T12:01:00Z', 'jours', 9, true],
    ['2026-11-09T11:00:00Z', 'jours', 1, true],
  ] as const)('%s → %s %i (retard : %s)', (creeLe, unite, valeur, enRetard) => {
    expect(ageDeLaDemande(creeLe, MAINTENANT)).toEqual({ unite, valeur, enRetard });
  });

  it('le retard commence strictement au-delà de 24 h', () => {
    const pile = new Date(MAINTENANT.getTime() - DELAI_DE_RETARD_MS).toISOString();
    const apres = new Date(MAINTENANT.getTime() - DELAI_DE_RETARD_MS - 60_000).toISOString();
    expect(ageDeLaDemande(pile, MAINTENANT).enRetard).toBe(false);
    expect(ageDeLaDemande(apres, MAINTENANT)).toEqual({ unite: 'jours', valeur: 1, enRetard: true });
  });

  it('une date illisible ou future vaut « à l’instant »', () => {
    expect(ageDeLaDemande('n’importe quoi', MAINTENANT).unite).toBe('instant');
    expect(ageDeLaDemande('2026-11-11T12:00:00Z', MAINTENANT).unite).toBe('instant');
  });
});

describe('borneDuRetard', () => {
  it('l’instant moins 24 h, arrondi à la minute, au format `AAAA-MM-JJ HH:MM:00`', () => {
    expect(borneDuRetard(new Date('2026-11-10T12:34:56.789Z'))).toBe('2026-11-09 12:34:00');
  });
});

describe('prenomDuDemandeur', () => {
  it.each([
    ['Mouhamed Dieng', 'Mouhamed'],
    ['  Awa   Diop ', 'Awa'],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s → %s', (nom, attendu) => {
    expect(prenomDuDemandeur(nom)).toBe(attendu);
  });
});
