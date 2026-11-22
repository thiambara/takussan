import { describe, expect, it } from 'vitest';

import { deplacer, ecrituresDuReglage, inverse, ordonner, type ChiffreRegle } from '../indicateurs';

const chiffre = (id: number, metric: string, sort_order: number, is_enabled = true): ChiffreRegle => ({
  id,
  metric,
  label: metric,
  format: 'number',
  sort_order,
  is_enabled,
});

/** TCK-2629 — « Terminé » n'écrit que ce qui a changé : le rang devient `sort_order`, l'interrupteur `is_enabled`. */
describe('TCK-2629 — les écritures du réglage', () => {
  const AVANT = ordonner([chiffre(1, 'revenue_month', 0), chiffre(2, 'overdue_amount', 1), chiffre(3, 'unpaid_rate_percent', 2)]);

  it('glisser « Taux d’impayés » en premier écrit le nouveau sort_order des trois lignes', () => {
    const apres = deplacer(AVANT, 2, 0);
    expect(apres.map((c) => c.id)).toEqual([3, 1, 2]);
    expect(ecrituresDuReglage(AVANT, apres)).toEqual([
      { id: 3, sort_order: 0 },
      { id: 1, sort_order: 1 },
      { id: 2, sort_order: 2 },
    ]);
  });

  it('masquer écrit is_enabled: false, et rien d’autre', () => {
    const apres = AVANT.map((c) => (c.id === 2 ? { ...c, is_enabled: false } : c));
    expect(ecrituresDuReglage(AVANT, apres)).toEqual([{ id: 2, is_enabled: false }]);
  });

  it('sans changement, aucune écriture', () => {
    expect(ecrituresDuReglage(AVANT, AVANT)).toEqual([]);
  });

  it('l’inverse d’une écriture rend l’état d’avant', () => {
    expect(inverse({ id: 3, sort_order: 0 }, AVANT)).toEqual({ id: 3, sort_order: 2 });
    expect(inverse({ id: 2, is_enabled: false }, AVANT)).toEqual({ id: 2, is_enabled: true });
  });

  it('l’ordre de l’API : sort_order puis id', () => {
    expect(ordonner([chiffre(5, 'a', 1), chiffre(4, 'b', 1), chiffre(9, 'c', 0)]).map((c) => c.id)).toEqual([9, 4, 5]);
  });
});
