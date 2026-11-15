import { describe, expect, it } from 'vitest';

import { coutDEntreeTotal, totalALEntreeDuBail } from '../cout-d-entree';

/**
 * TCK-2643 — le total à l'entrée d'un bail en saisie suit la formule de `CoutDEntree` (une seule
 * source, décision de la session), sur les valeurs du formulaire.
 */
describe('totalALEntreeDuBail (TCK-2643)', () => {
  it('rend le total de la maquette : 670 000 + 25 000 + caution 1 340 000, un mois d’avance', () => {
    expect(
      totalALEntreeDuBail({ loyer: 670_000, charges: 25_000, caution: 1_340_000, moisDAvance: 1, moisDeFrais: 0, devise: 'XOF' }),
    ).toEqual({ total: 2_035_000, loyer: 670_000, charges: 25_000, caution: 1_340_000, frais: 0, moisDAvance: 1 });
  });

  it('égale le coût d’entrée du bien quand la caution vaut ses mois', () => {
    const bien = { price: 333_333, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', advance_months: 2, deposit_months: 3, agency_fee_months: 1.5, monthly_charges: 12_500 };
    const duBail = totalALEntreeDuBail({ loyer: 333_333, charges: 12_500, caution: 333_333 * 3, moisDAvance: 2, moisDeFrais: 1.5, devise: 'XOF' });

    expect(duBail?.total).toBe(coutDEntreeTotal(bien));
  });

  it('prend la caution saisie, pas un nombre de mois', () => {
    expect(totalALEntreeDuBail({ loyer: 152_500, charges: null, caution: 75_500, moisDAvance: 1, moisDeFrais: null, devise: 'XOF' })?.total).toBe(228_000);
  });

  it('ne rend rien sans loyer (une vente)', () => {
    expect(totalALEntreeDuBail({ loyer: null, charges: 0, caution: 0, moisDAvance: 1, moisDeFrais: 0, devise: 'XOF' })).toBeNull();
  });
});
