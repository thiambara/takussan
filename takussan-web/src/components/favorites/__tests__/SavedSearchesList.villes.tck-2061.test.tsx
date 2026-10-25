/**
 * P185.02 (TCK-2061) — les villes posées depuis le profil (`criteria.cities`, TCK-136) se lisent
 * dans le résumé de l'alerte et dans son lien vers les résultats.
 *
 * Avant : `SEARCH_FILTER_KEYS` ne connaissait que `city`. `cities=Dakar,Thiès` partait dans le lien
 * `/properties`, que `filtersFromSearchParams` ne lisait pas : la ville sortait du résumé, et la
 * page de résultats montrait le pays entier.
 *
 * L'aller-retour gardé : `criteria` → URL → filtres → URL → `criteria`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { filtersFromSearchParams, filtersToParams } from '@/hooks/useSearch';
import { filtersToCriteria } from '../SaveSearchButton';
import { SavedSearchesList } from '../SavedSearchesList';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

function monte(criteria: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({
      data: [{
        id: 7,
        user_id: 1,
        name: 'Mes villes',
        criteria,
        notification_frequency: 'daily',
        is_active: true,
        results_count: 0,
        alert_channels: ['inapp'],
        created_at: null,
      }],
    }), { status: 200 })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(<QueryClientProvider client={client}><SavedSearchesList /></QueryClientProvider>, 'fr'),
  );
}

describe('<SavedSearchesList> — les villes du profil (P185.02, TCK-2061)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('le résumé nomme chaque ville, et le lien les porte vers les résultats', async () => {
    const { container } = monte({ cities: ['Dakar', 'Thiès'] });
    expect(await screen.findByText('Dakar · Thiès')).toBeInTheDocument();
    const lien = container.querySelector('a[href*="/properties"]');
    expect(lien?.getAttribute('href')).toContain('cities=Dakar%2CThi%C3%A8s');
  });

  it('aller-retour criteria → URL → filtres → URL → criteria', () => {
    const filtres = filtersFromSearchParams(new URLSearchParams('cities=Dakar,Thiès&price_max=300000'));
    expect(filtres.cities).toEqual(['Dakar', 'Thiès']);
    expect(filtersToParams(filtres).get('cities')).toBe('Dakar,Thiès');
    expect(filtersToCriteria(filtres)).toEqual({ cities: ['Dakar', 'Thiès'], price_max: 300000 });
  });

  it('un segment vide ne fabrique pas de ville', () => {
    expect(filtersFromSearchParams(new URLSearchParams('cities=Dakar,,')).cities).toEqual(['Dakar']);
    expect(filtersFromSearchParams(new URLSearchParams('cities=')).cities).toBeUndefined();
  });
});
