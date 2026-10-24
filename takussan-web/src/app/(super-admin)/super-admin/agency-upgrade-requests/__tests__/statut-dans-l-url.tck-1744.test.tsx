import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAdminAgencyUpgradeRequests } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import AgencyUpgradeRequestsListPage from '../page';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
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
 * TCK-1744 (P168.04) — `?status=` des demandes de passage ne servait que d'amorce (TCK-360) : un
 * autre statut choisi laissait l'URL dire « en attente », et le retour du détail rendait
 * « toutes ». L'URL est la source du statut, et le lien vers le détail porte la requête de la liste.
 */
describe('/super-admin/agency-upgrade-requests — statut dans l’URL (TCK-1744)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationDeTest.reinitialiser();
    vi.mocked(fetchAdminAgencyUpgradeRequests).mockResolvedValue({
      data: [{
        id: 7, agency_id: 3, status: 'pending', planned_agents_count: 2,
        submitted_at: '2026-10-19T10:00:00Z', created_at: '2026-10-19T10:00:00Z',
        agency: { id: 3, name: 'Espace de Awa', slug: 'espace-de-awa' }, submitter: null,
      }],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
    } as never);
  });

  it('écrit le statut choisi dans l’URL, et le suit', async () => {
    navigationDeTest.reinitialiser('status=pending');
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'Rejetées' }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?status=rejected', { scroll: false });
    await waitFor(() => expect(fetchAdminAgencyUpgradeRequests).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    ));
  });

  it('« Tous » retire le statut de l’URL', async () => {
    navigationDeTest.reinitialiser('status=pending');
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'Tous' }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?', { scroll: false });
  });

  it('les liens vers le détail portent la requête de la liste', async () => {
    navigationDeTest.reinitialiser('status=pending');
    renderPage();

    const attendu = `/super-admin/agency-upgrade-requests/7?liste=${encodeURIComponent('status=pending')}`;
    await waitFor(() => expect(screen.getAllByRole('link').filter((l) => l.getAttribute('href') === attendu)).toHaveLength(2));
  });
});
