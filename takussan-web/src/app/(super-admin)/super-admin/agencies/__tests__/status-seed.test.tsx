import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { fetchAdminAgencies } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import SuperAdminAgenciesPage from '../page';

const params = new URLSearchParams();

vi.mock('next/navigation', () => ({ useSearchParams: () => params }));

// Mock PARTIEL : cette page monte `AgencyOnboardingDialog` et `AgencyModerationCard`, qui
// importent `postAgencyOnboarding` et `postAgencyAction` du même module. Un mock total les
// rendrait `undefined` et ferait échouer le rendu pour une raison étrangère au sujet du test.
vi.mock('@/lib/queries/super-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/super-admin')>()),
  fetchAdminAgencies: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // `AgencyOnboardingDialog`, monté par l'en-tête de la page, appelle `useToast()` : sans
  // provider, c'est le RENDU qui casse, avant même que le filtre soit lu.
  render(withIntl(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <SuperAdminAgenciesPage />
      </QueryClientProvider>
    </ToastProvider>,
  ));
}

/**
 * TCK-360, AC1 — « aucune métrique affichée sans lien vers la vue FILTRÉE ».
 *
 * Deux tuiles de `SystemMetricsGrid` mènent ici avec `?status=active` et `?status=suspended`. Le
 * lien seul ne suffit pas : sans amorce, le super-admin arrive sur TOUTES les agences et le
 * nombre qu'il vient de lire n'est plus celui qu'il a sous les yeux.
 *
 * Jumeau de `agency-upgrade-requests/__tests__/status-seed.test.tsx` — cette amorce-ci était le
 * seul mutant survivant de la revue (ablation I : 23 fichiers rejoués, aucun rouge).
 */
describe('/super-admin/agencies — amorce du filtre par l’URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `params` est PARTAGÉ entre les cas : sans purge, un `?status=` posé par un test fuit
    // dans le suivant et l'assertion porterait sur une URL que ce test n'a pas écrite.
    params.delete('status');
    params.delete('is_verified');
    vi.mocked(fetchAdminAgencies).mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 15 },
    });
  });

  it('ouvre sur les agences suspendues quand l’URL le demande', async () => {
    params.set('status', 'suspended');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'suspended' }),
    ));
  });

  it('ouvre sur les agences actives quand l’URL le demande', async () => {
    params.set('status', 'active');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    ));
  });

  it('retombe sur « toutes » pour un statut inconnu plutôt que de filtrer sur du vide', async () => {
    params.set('status', 'nawak');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
    ));
  });

  /**
   * TCK-390 — la tuile « Vérifiées » de l'accueil portait le MÊME href que « Agences (total) »,
   * faute d'un filtre côté API. Elle mène désormais à `?is_verified=1`, et cette amorce-ci
   * rougit si l'initialiseur repasse en constante — comme celle de `status`.
   */
  it('ouvre sur les agences vérifiées quand l’URL le demande', async () => {
    params.set('is_verified', '1');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalledWith(
      expect.objectContaining({ isVerified: true }),
    ));
  });

  it('ouvre sur les agences NON vérifiées quand l’URL le demande', async () => {
    params.set('is_verified', '0');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalledWith(
      expect.objectContaining({ isVerified: false }),
    ));
  });

  it('retombe sur « toutes » pour un `is_verified` inconnu', async () => {
    params.set('is_verified', 'peut-etre');
    renderPage();

    await waitFor(() => expect(fetchAdminAgencies).toHaveBeenCalledWith(
      expect.objectContaining({ isVerified: undefined }),
    ));
  });
});
