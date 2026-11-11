/**
 * TCK-2586 — les règles pures de la feuille « Planifier une visite ». Navigateur à Paris : entre
 * minuit et une heure, son jour a un jour d'avance sur celui de Dakar.
 */
process.env.TZ = 'Europe/Paris';

import { describe, expect, it } from 'vitest';
import { creneauxProposes, etiquetteDuJour, joursProposes, jourEnClair, jourEnToutesLettres } from '../planification';

describe('joursProposes', () => {
  it('aujourd’hui et les quatre jours suivants, au jour de Dakar', () => {
    // 23:30 Z le 11 : 00:30 le 12 à Paris, encore le 11 à Dakar.
    expect(joursProposes(new Date('2026-11-11T23:30:00Z'))).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  });

  it('passe le mois', () => {
    expect(joursProposes(new Date('2026-11-29T10:00:00Z')).slice(-2)).toEqual(['2026-12-02', '2026-12-03']);
  });
});

describe('les libellés du jour', () => {
  it('« Jeu. 12 », « jeu. 12 nov. » et « Jeudi 12 novembre »', () => {
    expect(etiquetteDuJour('2026-11-12', 'fr')).toBe('Jeu. 12');
    expect(jourEnClair('2026-11-12', 'fr')).toBe('jeu. 12 nov.');
    expect(jourEnToutesLettres('2026-11-12', 'fr')).toBe('Jeudi 12 novembre');
  });
});

describe('creneauxProposes', () => {
  const maintenant = new Date('2026-11-12T09:10:00Z');
  const creneau = (label: string, available: boolean) => ({ start: `2026-11-12T${label}:00Z`, label, available });

  it('une heure passée ou dans le délai de prévenance n’est pas proposée ; une prise l’est, barrée', () => {
    expect(
      creneauxProposes([creneau('09:00', false), creneau('09:30', false), creneau('10:00', false), creneau('10:30', true)], maintenant),
    ).toEqual([
      { start: '2026-11-12T10:00:00Z', label: '10:00', sort: 'pris' },
      { start: '2026-11-12T10:30:00Z', label: '10:30', sort: 'libre' },
    ]);
  });

  it('la borne est incluse : un créneau à trente minutes pile reste proposé', () => {
    expect(creneauxProposes([creneau('09:40', true)], maintenant)).toHaveLength(1);
  });
});
