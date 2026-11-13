import { describe, expect, it } from 'vitest';

import { bornesDuMois, largeursDeLaBarre, lireLoyersDuMois } from '../loyers-du-mois';

/** TCK-2624 (lot 2) — `rent_month` lu tel que l'API le sert, sans rien en déduire. */
describe('lireLoyersDuMois', () => {
  it('AC4 — « 8 reçus sur 14 » et le montant reçu, sans segment que l’API ne sert pas', () => {
    expect(lireLoyersDuMois({ rent_month: { received_count: 8, expected_count: 14, received_amount: 11_400_000 } })).toEqual({
      recus: 8,
      attendus: 14,
      montantRecu: 11_400_000,
      enRetard: null,
      aVenir: null,
    });
  });

  it('« en retard » et « à venir » ne sont jamais déduits de `overdue_count` (toutes périodes) du tableau', () => {
    const l = lireLoyersDuMois({ overdue_count: 3, overdue_amount: 4_100_000, rent_month: { received_count: 8, expected_count: 14, received_amount: 1 } });
    expect(l?.enRetard).toBeNull();
    expect(l?.aVenir).toBeNull();
  });

  it('les segments de TCK-2774 sont rendus quand l’API les sert, et seulement s’ils bouclent sur les attendus', () => {
    const servi = { received_count: 8, expected_count: 14, received_amount: 1, overdue_count: 3, overdue_amount: 4_100_000, upcoming_count: 3, upcoming_amount: 3_200_000 };
    expect(lireLoyersDuMois({ rent_month: servi })?.enRetard).toEqual({ n: 3, montant: 4_100_000 });
    expect(lireLoyersDuMois({ rent_month: { ...servi, upcoming_count: 2 } })?.enRetard).toBeNull();
  });

  it('rien à dire : bloc absent, illisible, mois sans loyer, ou reçus au-delà des attendus', () => {
    expect(lireLoyersDuMois({})).toBeNull();
    expect(lireLoyersDuMois(null)).toBeNull();
    expect(lireLoyersDuMois({ rent_month: [] })).toBeNull();
    expect(lireLoyersDuMois({ rent_month: { received_count: '8', expected_count: 14, received_amount: 0 } })).toBeNull();
    expect(lireLoyersDuMois({ rent_month: { received_count: 0, expected_count: 0, received_amount: 0 } })).toBeNull();
    expect(lireLoyersDuMois({ rent_month: { received_count: 9, expected_count: 8, received_amount: 0 } })).toBeNull();
  });
});

describe('largeursDeLaBarre', () => {
  it('la part des reçus, au dixième', () => {
    const l = lireLoyersDuMois({ rent_month: { received_count: 8, expected_count: 14, received_amount: 0 } })!;
    expect(largeursDeLaBarre(l)).toEqual({ recus: 57.1, enRetard: 0 });
  });
});

describe('bornesDuMois', () => {
  it('le premier et le dernier jour du mois du jour donné, février bissextile compris', () => {
    expect(bornesDuMois('2026-11-13')).toEqual({ du: '2026-11-01', au: '2026-11-30', mois: 11 });
    expect(bornesDuMois('2028-02-10')).toEqual({ du: '2028-02-01', au: '2028-02-29', mois: 2 });
    expect(bornesDuMois('2026-12-31')).toEqual({ du: '2026-12-01', au: '2026-12-31', mois: 12 });
  });
});
