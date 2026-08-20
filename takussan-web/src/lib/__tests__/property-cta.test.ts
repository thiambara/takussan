import { describe, it, expect } from 'vitest';
import fr from '@/messages/fr.json';
import { getPrimaryCtaForProperty, PRIMARY_CTA_NAMESPACE } from '../property-cta';

describe('getPrimaryCtaForProperty (TCK-165)', () => {
  it('returns the `offer` action for a sale', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'sale' })).toEqual({ action: 'offer' });
  });

  it('returns the `reserve` action for short-term rent (daily/weekly)', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'daily' })).toEqual({
      action: 'reserve',
    });
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'weekly' })).toEqual({
      action: 'reserve',
    });
  });

  it('returns the `apply` action for long-term rent (monthly/yearly)', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'monthly' })).toEqual({
      action: 'apply',
    });
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'yearly' })).toEqual({
      action: 'apply',
    });
  });

  it('falls back to `apply` when rent has no rent_period (long-term assumed)', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: null })).toEqual({
      action: 'apply',
    });
  });

  it('falls back to `reserve` when contract_type is unknown', () => {
    expect(getPrimaryCtaForProperty({ contract_type: null })).toEqual({ action: 'reserve' });
  });

  /**
   * TCK-292 — le jeton `action` n'est plus seulement un discriminant de modal : c'est la CLÉ du
   * libellé. Un jeton sans entrée au dictionnaire rendrait la clé brute à l'écran, sans erreur.
   * Ce test garde donc l'accord entre les trois `action` possibles et `property.detail.primaryCta`,
   * et vérifie que les libellés français sont EXACTEMENT ceux d'avant la conversion (AC3).
   */
  it('every action resolves to its pre-conversion French label', () => {
    const table = (
      fr as unknown as { property: { detail: { primaryCta: Record<string, string> } } }
    ).property.detail.primaryCta;
    expect(PRIMARY_CTA_NAMESPACE).toBe('property.detail');
    expect(table).toEqual({
      offer: 'Faire une offre',
      reserve: 'Réserver',
      apply: 'Postuler',
    });
  });
});
