import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { fetchAdminAgencyUpgradeRequests } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import AgencyUpgradeRequestsListPage from '../page';

const params = new URLSearchParams();

vi.mock('next/navigation', () => ({ useSearchParams: () => params }));

vi.mock('@/lib/queries/super-admin', () => ({ fetchAdminAgencyUpgradeRequests: vi.fn() }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AgencyUpgradeRequestsListPage />
    </QueryClientProvider>,
  ));
}

/**
 * TCK-360, AC1 — « atteignable EN UN CLIC vers sa vue déjà filtrée ».
 *
 * La file de l'accueil compte les demandes `pending` ; cette page ouvrait sur « toutes ». Le lien
 * seul ne suffisait donc pas : le compte affiché n'était pas celui qu'on trouvait en arrivant.
 */
describe('/super-admin/agency-upgrade-requests — amorce du filtre par l’URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAdminAgencyUpgradeRequests).mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
    });
  });

  it('ouvre sur les demandes en attente quand l’URL le demande', async () => {
    params.set('status', 'pending');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencyUpgradeRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    ));
  });

  it('retombe sur « toutes » pour un statut inconnu plutôt que de filtrer sur du vide', async () => {
    params.set('status', 'nawak');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencyUpgradeRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'all' }),
    ));
  });
});
