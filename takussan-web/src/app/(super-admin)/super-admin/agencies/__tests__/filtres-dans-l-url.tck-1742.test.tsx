import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { fetchAdminAgencies } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import SuperAdminAgenciesPage from '../page';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/lib/queries/super-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/super-admin')>()),
  fetchAdminAgencies: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <SuperAdminAgenciesPage />
      </QueryClientProvider>
    </ToastProvider>,
  ));
}

const AGENCE = {
  id: 12, name: 'Dakar Immo', slug: 'dakar-immo', status: 'suspended', is_verified: true, verified_at: null,
  email: null, phone: null, logo_url: null, members_count: 1, properties_count: 0,
  created_at: '2026-01-15T10:00:00+00:00', last_activity_at: null, primary_admin: null,
};

/**
 * TCK-1742 (P168.04) — `?status=` et `?is_verified=` ne servaient que d'amorce (TCK-360) : choisir
 * « Suspendues » en arrivant par `?status=active` laissait l'URL dire « actives », et le retour du
 * détail rendait « toutes ». L'URL est maintenant la source de ces deux filtres, et le lien vers
 * le détail porte la requête de la liste pour que le retour la rende.
 */
describe('/super-admin/agencies — statut et vérification dans l’URL (TCK-1742)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationDeTest.reinitialiser();
    vi.mocked(fetchAdminAgencies).mockResolvedValue({
      data: [AGENCE],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 15 },
    } as never);
  });

  it('écrit le statut choisi dans l’URL, et le suit', async () => {
    navigationDeTest.reinitialiser('status=active');
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'Suspendues' }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?status=suspended', { scroll: false });
    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'suspended' }),
    ));
  });

  it('« Tous statuts » retire le filtre de l’URL', async () => {
    navigationDeTest.reinitialiser('status=active&is_verified=1');
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'Tous statuts' }));

    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?is_verified=1', { scroll: false });
  });

  it('le lien vers le détail porte la requête de la liste', async () => {
    navigationDeTest.reinitialiser('status=suspended&is_verified=1');
    renderPage();

    const liens = await screen.findAllByRole('link', { name: /Dakar Immo/ });
    expect(liens[0]).toHaveAttribute(
      'href',
      `/super-admin/agencies/12?liste=${encodeURIComponent('status=suspended&is_verified=1')}`,
    );
  });
});
