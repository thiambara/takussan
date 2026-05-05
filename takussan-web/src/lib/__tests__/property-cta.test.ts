import { describe, it, expect } from 'vitest';
import { getPrimaryCtaForProperty } from '../property-cta';

describe('getPrimaryCtaForProperty (TCK-165)', () => {
  it('returns "Faire une offre" for a sale', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'sale' })).toEqual({
      label: 'Faire une offre',
      action: 'offer',
    });
  });

  it('returns "Réserver" for short-term rent (daily/weekly)', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'daily' })).toEqual({
      label: 'Réserver',
      action: 'reserve',
    });
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'weekly' })).toEqual({
      label: 'Réserver',
      action: 'reserve',
    });
  });

  it('returns "Postuler" for long-term rent (monthly/yearly)', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'monthly' })).toEqual({
      label: 'Postuler',
      action: 'apply',
    });
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: 'yearly' })).toEqual({
      label: 'Postuler',
      action: 'apply',
    });
  });

  it('falls back to "Postuler" when rent has no rent_period (long-term assumed)', () => {
    expect(getPrimaryCtaForProperty({ contract_type: 'rent', rent_period: null })).toEqual({
      label: 'Postuler',
      action: 'apply',
    });
  });

  it('falls back to "Réserver" when contract_type is unknown', () => {
    expect(getPrimaryCtaForProperty({ contract_type: null })).toEqual({
      label: 'Réserver',
      action: 'reserve',
    });
  });
});
