import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAdminProperties } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import SuperAdminPropertiesPage from '../page';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/lib/queries/super-admin', () => ({ fetchAdminProperties: vi.fn() }));
vi.mock('@/components/admin/super/AgencyCombobox', () => ({ AgencyCombobox: () => null }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SuperAdminPropertiesPage />
    </QueryClientProvider>,
  ));
}

/**
 * P167.07 (TCK-2087) — la tuile « Biens publiés » de la console compte `Property::public()` et
 * ouvre `/super-admin/properties?filter[public]=1` : la liste doit envoyer ce filtre à l'API
 * (TCK-2036), sans quoi elle montre tout le catalogue sous le nombre de la tuile.
 */
describe('/super-admin/properties — filter[public] (TCK-2087)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAdminProperties).mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
    } as never);
  });

  it('relaie filter[public]=1 de l’URL à la lecture de la liste', async () => {
    navigationDeTest.reinitialiser('filter[public]=1');
    renderPage();

    await waitFor(() => expect(fetchAdminProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({ public: true }),
    ));
  });

  it('sans le paramètre, la liste ne filtre pas sur public', async () => {
    navigationDeTest.reinitialiser('');
    renderPage();

    await waitFor(() => expect(fetchAdminProperties).toHaveBeenCalled());
    expect(vi.mocked(fetchAdminProperties).mock.lastCall?.[0]?.public).toBeUndefined();
  });

  it('« réinitialiser » est actif quand seul filter[public] est posé', async () => {
    navigationDeTest.reinitialiser('filter[public]=1');
    renderPage();

    expect(await screen.findByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });
});
