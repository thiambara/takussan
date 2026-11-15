import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { oublierLesPeriodesCourtes } from '@/components/bookings/usePeriodesCourtesOffertes';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));

// Le rail se voit dès `lg` ; sous `lg`, seul le tiroir ouvert montre le panneau (TCK-1088).
const ecran = vi.hoisted(() => ({ bureau: true }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

const apiFetch = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

/**
 * TCK-2510 — dans la feuille de filtres, « Journalier » et « Hebdo » ne s'affichent que s'ils ont
 * des biens à montrer (audit UX § 8 : la base de démo n'en avait aucun, le filtre menait à une
 * liste vide). Le compte vient de la recherche publique (`meta.total`).
 */

/** Un bien à la semaine, aucun à la nuit ; toute autre lecture (répartition des prix…) rend vide. */
function catalogue(chemin: string) {
  if (chemin.includes('rent_period=daily')) return Promise.resolve({ data: [], meta: { total: 0 } });
  if (chemin.includes('rent_period=weekly')) return Promise.resolve({ data: [], meta: { total: 2 } });
  return Promise.resolve({ data: { buckets: [], min: 0, max: 0 } });
}

function monte(filters: SearchFilters, { tiroir = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      {withIntl(
        <FilterSidebar filters={filters} onFilterChange={vi.fn()} onReset={vi.fn()} activeCount={0} open={tiroir} onClose={() => {}} />,
      )}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(catalogue);
  ecran.bureau = true;
  oublierLesPeriodesCourtes();
});

describe('FilterSidebar — périodes courtes (TCK-2510)', () => {
  it('en location : « Journalier » sans bien disparaît, « Hebdo » avec des biens reste', async () => {
    monte({ contract_type: 'rent' });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Journalier' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Hebdo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mensuel' })).toBeInTheDocument();
  });

  it('« Journalier » choisi (lien partagé) reste affiché : il doit pouvoir se retirer', async () => {
    monte({ contract_type: 'rent', rent_period: 'daily' });

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/public/properties/search?contract_type=rent&rent_period=daily&per_page=1'),
    );
    expect(screen.getByRole('button', { name: 'Journalier' })).toBeInTheDocument();
  });

  it('panneau caché (mobile, tiroir fermé) : aucune sonde — comme le référentiel (TCK-1088)', async () => {
    ecran.bureau = false;
    monte({ contract_type: 'rent' });
    await new Promise((r) => setTimeout(r, 50));
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('rent_period='));
  });

  it('mobile, tiroir ouvert : la sonde part', async () => {
    ecran.bureau = false;
    monte({ contract_type: 'rent' }, { tiroir: true });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/public/properties/search?contract_type=rent&rent_period=weekly&per_page=1'),
    );
  });

  it('hors location, aucune sonde', () => {
    monte({ contract_type: 'sale' });
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('rent_period='));
  });
});
