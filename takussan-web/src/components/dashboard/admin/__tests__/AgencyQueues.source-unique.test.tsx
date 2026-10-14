import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AgencyQueues } from '../AgencyQueues';
import { AppSidebar } from '@/components/layout/AppSidebar';
import type { User } from '@/types/user';

/**
 * TCK-375, AC5 — **le compteur de modération n'est sondé qu'UNE fois par l'application.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST MONTE LES DEUX COMPOSANTS ENSEMBLE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Pris isolément, chacun des deux est irréprochable : la barre latérale fait UNE requête,
 * `AgencyQueues` en fait UNE. Le défaut ne vit que dans leur COEXISTENCE — et le tableau de bord
 * d'agence les monte tous les deux, la barre latérale venant du layout et le bloc de files de la
 * page.
 *
 * TCK-649 (ADR-0064 §2) — la barre est désormais `AppSidebar` : la console d'agence a rejoint la
 * coque de `/app`, et sa section d'agence porte le badge de modération que portait la barre de
 * l'ancienne console. Le bloc de files vit sous `/app/overview/agency` depuis TCK-647 : les deux
 * se rencontrent donc dans la MÊME coque, ce que ce test monte.
 *
 * Deux `queryKey` divergentes, ce seraient deux requêtes réseau pour le même nombre, puis — après
 * une décision de modération qui n'invalide qu'une des deux — un badge à 3 devant une tuile à 4.
 * Aucun test de rendu pris séparément ne le voit ; c'est le `QueryClient` PARTAGÉ qui le montre.
 *
 * ⚠ Vérifié par ablation le 2026-08-27 (sur la barre de l'ancienne console, dont `AppSidebar` a
 * repris le sondage à l'identique) : en lui redonnant sa `queryKey` d'origine
 * écrite en ligne (`['property-moderation', 'pending-count']` avec sa propre `queryFn`, forme
 * d'avant ce ticket), `fetchPropertyModerationQueue` est appelé **2 fois** et ce test rougit. Le
 * partage de la clé n'est donc pas décoratif : c'est lui que le test mesure.
 */

const mockFetchModeration = vi.fn();
const mockFetchReviewModeration = vi.fn();
const mockFetchKyc = vi.fn();
const mockApiRequest = vi.fn();

vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: (...args: unknown[]) => mockFetchModeration(...args),
}));

vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: (...args: unknown[]) => mockFetchReviewModeration(...args),
}));

vi.mock('@/lib/queries/kyc', () => ({
  fetchAgencyKyc: (...args: unknown[]) => mockFetchKyc(...args),
}));

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/overview/agency',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const ADMIN: User = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Ndiaye',
  full_name: 'Awa Ndiaye',
  email: 'awa@example.test',
  phone: null,
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: null,
  two_factor_enabled: false,
  agency_id: 7,
  roles: ['agency_admin'],
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
};

function page(total: number) {
  return { data: [], meta: { total, current_page: 1, last_page: 1, per_page: 1, pending_count: total } };
}

describe('compteur de modération — une seule source (TCK-375, AC5)', () => {
  beforeEach(() => {
    mockFetchModeration.mockReset();
    mockFetchReviewModeration.mockReset();
    mockFetchKyc.mockReset();
    mockApiRequest.mockReset();
    mockFetchModeration.mockResolvedValue(page(6));
    mockFetchReviewModeration.mockResolvedValue(page(0));
    mockFetchKyc.mockResolvedValue({ data: { id: 1, status: 'verified' } });
    mockApiRequest.mockResolvedValue(page(0));
  });

  it('la barre latérale et le bloc de files partagent UNE requête et UN nombre', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      withIntl(
        <QueryClientProvider client={client}>
          <AppSidebar user={ADMIN} agencyIsStandard />
          <AgencyQueues agencyId={7} agencyIsStandard overdueCount={0} />
        </QueryClientProvider>,
      ),
    );

    // Le badge de la barre latérale.
    expect(await screen.findByLabelText('6 en attente')).toHaveTextContent('6');
    // La tuile de l'accueil — le MÊME nombre.
    await waitFor(() =>
      expect(screen.getByTestId('queue-value-moderation')).toHaveTextContent('6 biens à modérer'),
    );

    // UNE requête réseau, pas deux.
    expect(mockFetchModeration).toHaveBeenCalledTimes(1);
  });
});
