/**
 * TCK-2659 — la lecture pure d'une ligne d'encaissement : sa période, son jour, le groupement par
 * jour du téléphone et son total.
 */
import { describe, expect, it } from 'vitest';

import type { PaymentHistoryRow } from '@/types/invoice';

import { aUneHeure, grouperParJour, initialesDuNom, joursRecents, periodeDe, variationSurLeMoisPrecedent } from '../encaissement';

const ligne = (p: Partial<PaymentHistoryRow>) => ({ source: 'lease', payment_type: 'rent', period_start: null, due_date: null, date: null, paid_at: null, paid_amount: 0, ...p }) as PaymentHistoryRow;

describe('periodeDe (TCK-2659)', () => {
  it('un loyer nomme SON mois, lu de `period_start`, sinon de l’échéance', () => {
    expect(periodeDe(ligne({ period_start: '2026-11-01' }))).toEqual({ cle: 'rentDu', mois: '2026-11-01' });
    expect(periodeDe(ligne({ due_date: '2026-10-05' }))).toEqual({ cle: 'rentDu', mois: '2026-10-05' });
    expect(periodeDe(ligne({}))).toEqual({ cle: 'rent' });
    expect(periodeDe(ligne({ payment_type: 'charges', period_start: '2026-11-01' })).cle).toBe('chargesDu');
  });

  it('les autres types de bail se nomment sans mois', () => {
    expect(periodeDe(ligne({ payment_type: 'deposit', period_start: '2026-11-01' }))).toEqual({ cle: 'deposit' });
    expect(periodeDe(ligne({ payment_type: 'regularization' }))).toEqual({ cle: 'regularization' });
    expect(periodeDe(ligne({ payment_type: 'inconnu' }))).toEqual({ cle: 'autre' });
  });

  it('une réservation se lit par son type de réservation, jamais comme une caution de bail', () => {
    expect(periodeDe(ligne({ source: 'booking', payment_type: 'deposit' }))).toEqual({ cle: 'reservation.deposit' });
    expect(periodeDe(ligne({ source: 'booking', payment_type: 'rent' }))).toEqual({ cle: 'reservation.autre' });
  });
});

describe('grouperParJour (TCK-2659)', () => {
  const rows = [
    ligne({ date: '2026-11-11T00:00:00Z', paid_amount: 100 }),
    ligne({ date: '2026-11-11T00:00:00Z', paid_amount: 50 }),
    ligne({ date: '2026-11-10T00:00:00Z', paid_amount: 30 }),
    ligne({ date: '2026-11-09T00:00:00Z', paid_amount: 20 }),
  ];

  it('groupe les lignes consécutives d’un même jour et somme ce qui est encaissé', () => {
    const jours = grouperParJour(rows, { courante: 1, derniere: 1 });
    expect(jours.map((j) => [j.jour, j.lignes.length, j.total])).toEqual([
      ['2026-11-11', 2, 150],
      ['2026-11-10', 1, 30],
      ['2026-11-09', 1, 20],
    ]);
  });

  it('un jour peut-être coupé par la pagination n’a pas de total', () => {
    const jours = grouperParJour(rows, { courante: 2, derniere: 3 });
    expect(jours[0]?.total).toBeNull();
    expect(jours[1]?.total).toBe(30);
    expect(jours[2]?.total).toBeNull();
  });
});

describe('lectures de bord (TCK-2659)', () => {
  it('minuit pile n’est pas une heure', () => {
    expect(aUneHeure('2026-11-07T00:00:00Z')).toBe(false);
    expect(aUneHeure('2026-11-07T00:00:00.000000Z')).toBe(false);
    expect(aUneHeure('2026-11-07')).toBe(false);
    expect(aUneHeure('2026-11-07T14:32:00Z')).toBe(true);
  });

  it('la variation n’existe pas sans mois précédent', () => {
    expect(variationSurLeMoisPrecedent(108, 100)).toBeCloseTo(0.08);
    expect(variationSurLeMoisPrecedent(100, 0)).toBeNull();
  });

  it('les initiales prennent deux mots, et un point sans nom', () => {
    expect(initialesDuNom('Awa Diop Sarr')).toBe('AD');
    expect(initialesDuNom('  ')).toBe('·');
  });

  it('aujourd’hui et hier, à Dakar (UTC), passent le mois', () => {
    expect(joursRecents(new Date('2026-11-01T08:00:00Z'))).toEqual({ aujourdhui: '2026-11-01', hier: '2026-10-31' });
  });
});
