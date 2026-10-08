import { describe, expect, it } from 'vitest';
import { buildCompareRows } from '../compare-rows';
import { makeProperty } from './bien-de-test';

/** TCK-598 (V9) — le comparateur porte le coût d'entrée en ligne de critère : le total de l'API. */
describe('compare-rows — coût d’entrée', () => {
  const NBSP = /[  ]/g;

  it('une ligne « coût d’entrée » quand un bien en a un, avec le total de l’API', () => {
    const loue = makeProperty({
      id: 1,
      contract_type: 'rent',
      price: 300_000,
      entry_cost: { advance_months: 2, deposit_months: 2, agency_fee_months: 1, monthly_charges: 10_000, total: 1_520_000 },
    });
    const sansCout = makeProperty({ id: 2, entry_cost: null });

    const ligne = buildCompareRows([loue, sansCout]).find((r) => r.id === 'entry_cost');
    expect(ligne).toBeDefined();
    expect(String(ligne!.values[0]).replace(NBSP, ' ')).toContain('1 520 000');
    expect(ligne!.values[1]).toBeNull();
  });

  it('aucun bien n’a de coût d’entrée : pas de ligne de tirets', () => {
    const rows = buildCompareRows([makeProperty({ id: 1 }), makeProperty({ id: 2, entry_cost: null })]);
    expect(rows.find((r) => r.id === 'entry_cost')).toBeUndefined();
  });
});
