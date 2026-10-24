import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAdminAgencyUpgradeRequest } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import AgencyUpgradeRequestDetailPage from '../page';

vi.mock('next/navigation', async () => ({
  ...(await import('@/test/navigation-url')).moduleNavigation,
  useParams: () => ({ id: '7' }),
}));
vi.mock('@/lib/queries/super-admin', () => ({ fetchAdminAgencyUpgradeRequest: vi.fn() }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AgencyUpgradeRequestDetailPage />
    </QueryClientProvider>,
  ));
}

/**
 * TCK-1744 (P168.04) — le retour du détail d'une demande de passage menait toujours à la liste
 * nue. Il rend la requête que la liste lui a passée dans `?liste=`, bornée au statut connu.
 */
describe('/super-admin/agency-upgrade-requests/[id] — le retour rend la liste quittée (TCK-1744)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAdminAgencyUpgradeRequest).mockReturnValue(new Promise(() => {}));
  });

  it('rend la requête de la liste au lien de retour', async () => {
    navigationDeTest.reinitialiser(`liste=${encodeURIComponent('status=rejected')}`);
    renderPage();

    expect(await screen.findByRole('link', { name: 'Retour aux demandes' }))
      .toHaveAttribute('href', '/super-admin/agency-upgrade-requests?status=rejected');
  });

  it('ignore un statut inconnu', async () => {
    navigationDeTest.reinitialiser(`liste=${encodeURIComponent('status=bidon&x=1')}`);
    renderPage();

    expect(await screen.findByRole('link', { name: 'Retour aux demandes' }))
      .toHaveAttribute('href', '/super-admin/agency-upgrade-requests');
  });
});
