/**
 * TCK-1187 (P101.01) — une grille ARIA à demi déclarée (`role="grid"` sans `row`) rendait axe
 * critique (`aria-required-children`, `aria-required-parent`).
 *
 * TCK-2597 — le mois et la semaine de l'agenda ne sont plus des grilles ARIA : des groupes nommés,
 * leurs jours et leurs créneaux en boutons nommés (« Mardi 10 novembre : 2 événements »,
 * « Planifier une visite … à 15:00 »). Le test garde qu'aucune grille à demi déclarée ne revient.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import axe from 'axe-core';

import { MoisCompact, MoisDeLAgenda } from '@/components/agenda/MoisDeLAgenda';
import { SemaineDeLAgenda } from '@/components/agenda/SemaineDeLAgenda';
import { withIntl } from '@/test/intl';

async function violationsStructure(racine: Element): Promise<string[]> {
  const resultat = await axe.run(racine, {
    runOnly: { type: 'rule', values: ['aria-required-children', 'aria-required-parent'] },
    resultTypes: ['violations'],
  });
  return resultat.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`));
}

describe('grilles de l’agenda — structure ARIA (TCK-1187, TCK-2597)', () => {
  it('mois du bureau : un groupe nommé, ses jours en boutons nommés, sans violation axe', async () => {
    const { container, getByTestId } = render(withIntl(<MoisDeLAgenda jour="2026-01-15" aujourdhui="2026-01-15" evenements={[]} onOuvrir={() => {}} onChoisirJour={() => {}} />));

    expect(container.querySelector('[role="grid"]')).toBeNull();
    expect(container.querySelector('[role="group"]')).toHaveAttribute('aria-label', 'Janvier 2026');
    expect(getByTestId('calendar-day-2026-01-15')).toHaveAccessibleName('Jeudi 15 janvier : rien de prévu');
    expect(await violationsStructure(container)).toEqual([]);
  });

  it('mois du téléphone : le jour choisi est pressé', async () => {
    const { container, getByTestId } = render(withIntl(<MoisCompact jour="2026-01-15" aujourdhui="2026-01-15" evenements={[]} onChoisirJour={() => {}} />));

    expect(getByTestId('calendar-day-2026-01-15')).toHaveAttribute('aria-pressed', 'true');
    expect(getByTestId('calendar-day-2026-01-16')).toHaveAttribute('aria-pressed', 'false');
    expect(await violationsStructure(container)).toEqual([]);
  });

  it('semaine : un groupe nommé, sans violation axe de structure', async () => {
    const { container } = render(
      withIntl(
        <SemaineDeLAgenda
          jour="2026-01-15"
          aujourdhui="2026-01-15"
          maintenant={new Date('2026-01-15T10:00:00Z')}
          evenements={[]}
          visites={new Map()}
          sejoursDuJour={null}
          ouvert={null}
          onOuvrir={() => {}}
          onChoisirJour={() => {}}
          onPlanifier={() => {}}
          onOccupation={null}
        />,
      ),
    );

    expect(container.querySelector('[role="grid"]')).toBeNull();
    expect(container.querySelector('[role="group"]')).toHaveAttribute('aria-label', 'Semaine, heure par heure');
    expect(await violationsStructure(container)).toEqual([]);
  });
});
