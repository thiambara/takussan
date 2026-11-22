import { describe, expect, it } from 'vitest';

import { lireLoyersDuMois } from '../loyers-du-mois';

/**
 * TCK-2820 — un loyer échu remboursé est « reçu puis remboursé », pas « en retard » : l'API le sert à
 * part (`refunded_count`, `refunded_amount`), et l'invariant devient reçus + retard + à venir +
 * remboursés = attendus.
 */
const AC1 = {
  received_count: 8,
  expected_count: 14,
  received_amount: 2_400_000,
  overdue_count: 2,
  overdue_amount: 600_000,
  upcoming_count: 3,
  upcoming_amount: 750_000,
  refunded_count: 1,
  refunded_amount: 300_000,
};

describe('lireLoyersDuMois — reçus puis remboursés', () => {
  it('AC1 servi : les segments bouclent avec les remboursés, qui sont lus à part', () => {
    expect(lireLoyersDuMois({ rent_month: AC1 })).toEqual({
      recus: 8,
      attendus: 14,
      montantRecu: 2_400_000,
      enRetard: { n: 2, montant: 600_000 },
      aVenir: { n: 3, montant: 750_000 },
      rembourses: { n: 1, montant: 300_000 },
    });
  });

  it('absents (API d’avant TCK-2820) : comptés 0, les segments de TCK-2774 restent rendus', () => {
    const { refunded_count: _n, refunded_amount: _m, ...avant } = AC1;
    const l = lireLoyersDuMois({ rent_month: { ...avant, overdue_count: 3 } });
    expect(l?.enRetard).toEqual({ n: 3, montant: 600_000 });
    expect(l?.rembourses).toBeNull();
  });

  it('zéro remboursé : aucune part à rendre', () => {
    const l = lireLoyersDuMois({ rent_month: { ...AC1, overdue_count: 3, refunded_count: 0, refunded_amount: 0 } });
    expect(l?.enRetard?.n).toBe(3);
    expect(l?.rembourses).toBeNull();
  });

  it('un compte qui ne boucle pas, ou illisible : aucun segment rendu', () => {
    const incoherent = lireLoyersDuMois({ rent_month: { ...AC1, refunded_count: 2 } });
    expect(incoherent?.enRetard).toBeNull();
    expect(incoherent?.rembourses).toBeNull();
    const illisible = lireLoyersDuMois({ rent_month: { ...AC1, refunded_count: '1' } });
    expect(illisible?.enRetard).toBeNull();
    expect(illisible?.rembourses).toBeNull();
  });
});
