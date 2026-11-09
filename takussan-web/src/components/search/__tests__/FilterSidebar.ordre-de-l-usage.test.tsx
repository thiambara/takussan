import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));

const apiFetch = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

/**
 * TCK-2499 — la feuille de filtres dans l'ordre de l'usage : Louer/Acheter, budget (avec la
 * répartition des prix), lieu, chambres, puis le type de bien et le reste. AC2 : le budget et les
 * chambres sont visibles à l'ouverture sans défiler — l'ordre en est la condition (la mesure au
 * navigateur est dans les notes du ticket).
 */

const REPARTITION = {
  data: {
    buckets: [
      { from: 0, to: 500_000, count: 12 },
      { from: 500_000, to: 1_000_000, count: 32 },
      { from: 1_000_000, to: 1_500_000, count: 47 },
      { from: 1_500_000, to: 2_000_000, count: 16 },
    ],
    min: 154_952,
    max: 1_980_000,
  },
};

function monte(filters: SearchFilters = {}, { tiroir = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      {withIntl(
        <FilterSidebar
          filters={filters}
          onFilterChange={vi.fn()}
          onReset={vi.fn()}
          activeCount={0}
          open={tiroir}
          onClose={() => {}}
        />,
      )}
    </QueryClientProvider>,
  );
}

const titresDansLOrdre = (racine: HTMLElement) =>
  within(racine)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);

describe('FilterSidebar — l’ordre de l’usage (TCK-2499)', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(REPARTITION);
  });

  it('transaction, budget, lieu, chambres, fréquence de loyer, autour de moi, type — puis le reste replié', () => {
    // Rien entre le budget et les chambres que le lieu : posée là, la fréquence de loyer
    // repoussait les chambres sous le pied du tiroir à 390 × 844 (AC2, mesuré au navigateur).
    monte({ contract_type: 'rent' });
    const rail = document.querySelector<HTMLElement>('[data-rail-filtres]')!;
    expect(titresDansLOrdre(rail).slice(0, 7)).toEqual([
      'Type de transaction',
      'Budget (FCFA)',
      'Localisation',
      'Chambres',
      'Fréquence de loyer',
      'Autour de moi',
      'Type de bien',
    ]);
    // Le bouton « Plus de filtres » suit le type : aucun filtre n'a quitté la feuille.
    const type = within(rail).getByRole('heading', { name: 'Type de bien' });
    const plus = within(rail).getByRole('button', { name: /^Plus de filtres/ });
    expect(type.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('le tiroir mobile suit le même ordre', () => {
    monte({ contract_type: 'sale' }, { tiroir: true });
    const tiroir = screen.getByRole('dialog');
    expect(titresDansLOrdre(tiroir).slice(0, 6)).toEqual([
      'Type de transaction',
      'Budget (FCFA)',
      'Localisation',
      'Chambres',
      'Autour de moi',
      'Type de bien',
    ]);
  });

  it('le budget porte la répartition des prix de la recherche, sans ses propres bornes', async () => {
    // Le tiroir : le rail ne demande rien sous `lg` (TCK-1088), et jsdom n'a pas de largeur.
    monte(
      { contract_type: 'rent', city: 'Dakar', price_min: 500_000, price_max: 1_000_000, sort: 'price_asc' },
      { tiroir: true },
    );
    const budget = within(screen.getByRole('dialog')).getByRole('heading', { name: 'Budget (FCFA)' }).parentElement!;
    await waitFor(() => expect(budget.querySelectorAll('[data-tranche]')).toHaveLength(4));

    const url = String(apiFetch.mock.calls[0]![0]);
    expect(url.startsWith('/public/properties/price-distribution?')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('contract_type')).toBe('rent');
    expect(params.get('city')).toBe('Dakar');
    // Les bornes et le tri ne filtrent pas la répartition (contrat de TCK-2498).
    expect(params.has('price_min')).toBe(false);
    expect(params.has('price_max')).toBe(false);
    expect(params.has('sort')).toBe(false);

    // Les tranches qui recoupent [500 000, 1 000 000] sont en relief, les autres non — aux bornes
    // exactes : [0, 500 000[ est sous le minimum, [1 000 000, 1 500 000[ contient le maximum.
    const enRelief = [...budget.querySelectorAll('[data-dans-le-budget]')].map((b) => b.getAttribute('data-tranche'));
    expect(enRelief).toEqual(['500000', '1000000']);
    // 12 + 32 + 47 ≥ 107 / 2 → sous 1 500 000. La phrase dit ce qui est compté — les LOYERS
    // MENSUELS, pas « les biens » de la liste, qui compte aussi les loyers à la semaine (revue).
    expect(within(budget).getByText(/^La moitié des loyers mensuels sont sous 1\s500\s000/)).toBeInTheDocument();
    expect(budget).not.toHaveTextContent(/des biens/);
  });

  it('à la vente, la phrase porte sur les prix de vente', async () => {
    monte({ contract_type: 'sale' }, { tiroir: true });
    const budget = within(screen.getByRole('dialog')).getByRole('heading', { name: 'Budget (FCFA)' }).parentElement!;
    expect(await within(budget).findByText(/^La moitié des prix de vente sont sous 1\s500\s000/)).toBeInTheDocument();
  });

  it('sans transaction, aucune répartition n’est demandée (un loyer et un prix n’ont pas d’échelle commune)', () => {
    monte({ city: 'Dakar' });
    expect(document.querySelector('[data-histogramme]')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
