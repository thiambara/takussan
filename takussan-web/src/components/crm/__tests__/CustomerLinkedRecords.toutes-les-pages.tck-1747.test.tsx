/**
 * TCK-1747 (P171.05) — les visites, réservations et baux d'une fiche client lisent TOUTES les pages.
 *
 * Avant : une page de 20 (`per_page: 20`), sans total ni page suivante : la 21ᵉ disparaissait sans
 * le dire. L'API est bouchonnée : 20 par défaut, 100 au plus, `meta.last_page`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerLinkedRecords } from '../CustomerLinkedRecords';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const lignes = Array.from({ length: 21 }, (_, i) => ({
  id: i + 1,
  status: 'confirmed',
  scheduled_at: '2026-10-10T10:00:00Z',
  start_date: '2026-10-10',
  property: { id: i + 1, title: `Bien ${i + 1}` },
}));

describe('TCK-1747 — la fiche client lit toutes les pages de ses rattachements', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (chemin: string) => {
      const u = new URL(chemin, 'http://api.test');
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 20), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      return {
        data: lignes.slice((page - 1) * perPage, page * perPage),
        meta: { current_page: page, last_page: Math.ceil(lignes.length / perPage), per_page: perPage, total: lignes.length },
      };
    });
  });

  it.each(['visits', 'bookings', 'leases'] as const)('%s : la 21ᵉ ligne s’affiche', async (kind) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <CustomerLinkedRecords customerId={4} kind={kind} />
      </QueryClientProvider>,
    ));

    expect(await screen.findByRole('link', { name: 'Bien 21' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(21);
  });
});
