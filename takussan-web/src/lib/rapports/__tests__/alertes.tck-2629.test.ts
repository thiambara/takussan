import { describe, expect, it } from 'vitest';

import { dernierDeclenchement, formeDeLaMetrique, jaugeDeLAlerte, POSITION_DU_SEUIL } from '../alertes';

/** TCK-2629 — la jauge et le seuil d'une alerte, lus de `current_value`. */
describe('TCK-2629 — la jauge d’une alerte', () => {
  it('« Taux d’impayés > 10 % » à 3,91 % : sous le seuil, remplissage au prorata, trait aux deux tiers', () => {
    const j = jaugeDeLAlerte({ operator: '>', threshold: 10, current_value: 3.91 });
    expect(j).not.toBeNull();
    expect(j!.sonne).toBe(false);
    expect(j!.part).toBeCloseTo((3.91 / 15) * 100, 5);
    expect(j!.seuil).toBeCloseTo(POSITION_DU_SEUIL, 5);
  });

  it('franchie : « Vacance > 20 % » à 27 %', () => {
    expect(jaugeDeLAlerte({ operator: '>', threshold: 20, current_value: 27 })!.sonne).toBe(true);
  });

  it('une règle « < » : 95,2 M au-dessus d’un seuil de 60 M ne sonne pas, la jauge est pleine', () => {
    const j = jaugeDeLAlerte({ operator: '<', threshold: 60_000_000, current_value: 95_200_000 });
    expect(j!.sonne).toBe(false);
    expect(j!.part).toBe(100);
  });

  it('sans valeur actuelle, pas de jauge — jamais 0 à sa place', () => {
    expect(jaugeDeLAlerte({ operator: '>', threshold: 10, current_value: null })).toBeNull();
    expect(jaugeDeLAlerte({ operator: '>', threshold: 10 })).toBeNull();
  });

  it('le dernier déclenchement : le journal, sinon la colonne, sinon jamais', () => {
    expect(dernierDeclenchement({ triggers: [{ at: '2026-11-03T08:00:00Z', value: 27 }], last_triggered_at: '2026-10-01T00:00:00Z' })).toBe('2026-11-03T08:00:00Z');
    expect(dernierDeclenchement({ triggers: [], last_triggered_at: '2026-10-01T00:00:00Z' })).toBe('2026-10-01T00:00:00Z');
    expect(dernierDeclenchement({ triggers: [], last_triggered_at: null })).toBeNull();
  });

  it('la forme d’une métrique', () => {
    expect(formeDeLaMetrique('unpaid_rate_percent')).toBe('pourcent');
    expect(formeDeLaMetrique('overdue_amount')).toBe('montant');
    expect(formeDeLaMetrique('overdue_count')).toBe('nombre');
  });
});
