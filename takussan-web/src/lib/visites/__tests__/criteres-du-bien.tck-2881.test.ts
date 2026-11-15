/**
 * TCK-2881 — miroir de `ContactLeadService::criteriaFromProperty` : la ligne « Critères déduits du
 * bien » ne promet que ce que la fiche née de la demande reçoit.
 */
import { describe, expect, it } from 'vitest';
import { criteresDuBien } from '../criteres-du-bien';

describe('criteresDuBien — TCK-2881', () => {
  it('type, quartier, et un plafond au prix × 1,2 (la règle de l’API), en entiers', () => {
    expect(criteresDuBien({ type: 'room', contract_type: 'rent', rent_period: 'monthly', price: '100000.00', location: { quarter: ' Ouakam ' } })).toEqual({
      type: 'room',
      quartier: 'Ouakam',
      budgetMax: 120_000,
    });
    expect(criteresDuBien({ contract_type: 'sale', price: 85_000 })?.budgetMax).toBe(102_000);
  });

  it('un loyer à la nuit ou à la semaine ne dit rien d’un budget mensuel', () => {
    expect(criteresDuBien({ type: 'studio', contract_type: 'rent', rent_period: 'daily', price: 25_000 })).toEqual({ type: 'studio', quartier: null, budgetMax: null });
    expect(criteresDuBien({ contract_type: 'rent', rent_period: 'weekly', price: 25_000 })).toBeNull();
  });

  it('sans bien, ou sans rien à reprendre : null', () => {
    expect(criteresDuBien(null)).toBeNull();
    expect(criteresDuBien({ price: 0, location: { quarter: '' } })).toBeNull();
  });
});
