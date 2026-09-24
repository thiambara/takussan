/**
 * TCK-580 — la puce touchée dit qu'elle attend ses biens, et elle seule.
 *
 * Le signal est la DIFFÉRENCE entre les filtres visés (`filters`, posés dès le clic par
 * `useSearch`) et ceux dont la grille montre la réponse (`filtresDesResultats`). Ces tests
 * rendent les deux jeux tels que `useSearch` les rend au milieu d'une attente — le cycle complet
 * (clic → URL → biens) est éprouvé par `useSearch.attente.test.tsx`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import { PucesDeFiltres } from '../SearchToolbar';
import type { SearchFilters } from '@/types/search';

function panneau(filters: SearchFilters, filtresDesResultats?: SearchFilters, enCours = false) {
  render(
    withIntl(
      <FilterSidebar
        filters={filters}
        filtresDesResultats={filtresDesResultats}
        enCours={enCours}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
        activeCount={0}
        open={false}
        onClose={() => {}}
      />,
    ),
  );
}

const puce = (nom: string) => screen.getAllByRole('button', { name: nom })[0]!;
const attend = (el: HTMLElement) => el.querySelector('[data-attente]') !== null;

describe('TCK-580 — panneau de filtres : la puce touchée attend, ses voisines non', () => {
  it('une puce AJOUTÉE est pressée tout de suite et porte l’attente', () => {
    panneau({ type: ['villa'] }, {});
    const villa = puce('Villa');
    expect(villa).toHaveAttribute('aria-pressed', 'true');
    expect(villa).toHaveAttribute('aria-busy', 'true');
    expect(attend(villa)).toBe(true);
    // La voisine n'a rien demandé.
    expect(attend(puce('Maison'))).toBe(false);
    expect(puce('Maison')).not.toHaveAttribute('aria-busy');
  });

  it('une puce RETIRÉE est relâchée tout de suite et porte l’attente', () => {
    panneau({}, { contract_type: 'sale' });
    const vente = puce('Vente');
    expect(vente).toHaveAttribute('aria-pressed', 'false');
    expect(attend(vente)).toBe(true);
  });

  it('une bascule attend comme une puce', () => {
    panneau({ furnished: true }, {});
    expect(attend(screen.getByRole('button', { name: /Meublé uniquement/ }))).toBe(true);
  });

  it('résultats à jour : aucune attente nulle part', () => {
    panneau({ type: ['villa'] }, { type: ['villa'] });
    expect(document.querySelector('[data-attente]')).toBeNull();
    expect(document.querySelector('[aria-busy]')).toBeNull();
  });

  it('sans suivi des résultats (appelant historique), rien n’attend', () => {
    panneau({ type: ['villa'] });
    expect(document.querySelector('[data-attente]')).toBeNull();
  });
});

describe('TCK-580 — puces actives : un retrait reste visible jusqu’à l’arrivée des biens', () => {
  function puces(filters: SearchFilters, filtresDesResultats?: SearchFilters) {
    const onRemoveFilter = vi.fn();
    render(
      withIntl(
        <PucesDeFiltres
          filters={filters}
          filtresDesResultats={filtresDesResultats}
          onRemoveFilter={onRemoveFilter}
          aria-label="Critères"
        />,
      ),
    );
    return { onRemoveFilter, rangee: screen.getByRole('group', { name: 'Critères' }) };
  }

  it('la puce retirée RESTE, en retrait, avec l’attente — et un second clic ne la retire pas deux fois', async () => {
    const { onRemoveFilter, rangee } = puces({ type: ['house'] }, { type: ['villa', 'house'] });
    const villa = within(rangee).getByRole('button', { name: /Villa/ });
    expect(villa).toHaveAttribute('data-etat-puce', 'retrait');
    expect(villa).toHaveAttribute('aria-disabled', 'true');
    expect(attend(villa)).toBe(true);

    await userEvent.click(villa);
    expect(onRemoveFilter).not.toHaveBeenCalled();

    const maison = within(rangee).getByRole('button', { name: /Maison/ });
    expect(maison).toHaveAttribute('data-etat-puce', 'stable');
    expect(attend(maison)).toBe(false);
  });

  it('la puce ajoutée apparaît tout de suite, avec l’attente', () => {
    const { rangee } = puces({ city: 'Dakar', type: ['villa'] }, { type: ['villa'] });
    const ville = within(rangee).getByRole('button', { name: /Dakar/ });
    expect(ville).toHaveAttribute('data-etat-puce', 'ajout');
    expect(attend(ville)).toBe(true);
  });

  it('une valeur REMPLACÉE est un retrait puis un ajout, pas une puce qui change sous le doigt', () => {
    const { rangee } = puces({ city: 'Thiès' }, { city: 'Dakar' });
    expect(within(rangee).getByRole('button', { name: /Dakar/ })).toHaveAttribute('data-etat-puce', 'retrait');
    expect(within(rangee).getByRole('button', { name: /Thiès/ })).toHaveAttribute('data-etat-puce', 'ajout');
  });
});
