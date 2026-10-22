/**
 * TCK-1187 (P101.01) — les vues mois et semaine déclarent `role="grid"` : ARIA exige
 * `grid > row > gridcell|columnheader`. Sans `row`, axe rendait `aria-required-children` sur la
 * grille et `aria-required-parent` sur ses 49 (mois) et 14 (semaine) nœuds, tous deux critiques.
 *
 * Le test passe axe sur le composant rendu, règles nommées seulement, et vérifie en plus que
 * chaque en-tête et chaque cellule a un `row` pour parent DIRECT, dans la grille.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';

import { withIntl } from '@/test/intl';
import { MonthView } from '../MonthView';
import { WeekView } from '../WeekView';

const FOCUS = new Date(2026, 0, 15);

async function violationsStructure(racine: Element): Promise<string[]> {
  const resultat = await axe.run(racine, {
    runOnly: { type: 'rule', values: ['aria-required-children', 'aria-required-parent'] },
    resultTypes: ['violations'],
  });
  return resultat.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`));
}

function cellulesSansRangee(racine: Element): Element[] {
  return Array.from(racine.querySelectorAll('[role="gridcell"], [role="columnheader"]')).filter(
    (cellule) => cellule.parentElement?.getAttribute('role') !== 'row',
  );
}

describe('grilles du calendrier — structure ARIA (TCK-1187, P101.01)', () => {
  it('vue mois : en-têtes et jours rangés dans des `row`, sans violation axe', async () => {
    const { container } = render(withIntl(<MonthView focus={FOCUS} events={[]} onSelect={() => {}} />));

    const grille = container.querySelector('[role="grid"]')!;
    expect(grille.querySelectorAll('[role="gridcell"], [role="columnheader"]').length).toBeGreaterThanOrEqual(42);
    expect(cellulesSansRangee(grille)).toEqual([]);
    // Chaque rangée de jours porte une semaine entière.
    const rangees = Array.from(grille.querySelectorAll(':scope > [role="row"]'));
    expect(rangees[0].querySelectorAll('[role="columnheader"]')).toHaveLength(7);
    for (const rangee of rangees.slice(1)) {
      expect(rangee.querySelectorAll(':scope > [role="gridcell"]')).toHaveLength(7);
    }
    expect(await violationsStructure(container)).toEqual([]);
  });

  it('vue semaine : en-têtes et jours rangés dans des `row`, sans violation axe', async () => {
    const { container } = render(withIntl(<WeekView focus={FOCUS} events={[]} onSelect={() => {}} />));

    const grille = container.querySelector('[role="grid"]')!;
    expect(grille.querySelectorAll('[role="gridcell"], [role="columnheader"]')).toHaveLength(14);
    expect(cellulesSansRangee(grille)).toEqual([]);
    expect(await violationsStructure(container)).toEqual([]);
  });
});
