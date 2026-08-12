import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';
import { FeatureFlagProvider, useFeatureFlag } from '../FeatureFlagProvider';

/**
 * `/api/feature-flags/me` est authentifié (auth:sanctum). `FeatureFlagProvider`
 * conditionne donc sa requête à la présence d'un utilisateur — c'est la porte posée
 * par `db24b064`, et c'est elle que ces deux cas éprouvent.
 *
 * La porte avait cassé ce fichier sans que personne le voie : il n'y a aucune CI
 * frontend, et le test rendait le provider hors de tout `AuthContext` — donc
 * `user` valait `null`, la requête ne partait jamais, et le seul cas du fichier
 * échouait depuis. Le test mesurait un contrat que le code n'a plus.
 */
let utilisateurCourant: User | null = null;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: utilisateurCourant, token: null, isLoading: false }),
}));

function Probe() {
  return <span>{useFeatureFlag('property_compare') ? 'enabled' : 'disabled'}</span>;
}

function monter() {
  // `retry: false` : sans lui, un échec de requête met le test à la merci des
  // temporisations de react-query au lieu de le faire rougir tout de suite.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FeatureFlagProvider>
        <Probe />
      </FeatureFlagProvider>
    </QueryClientProvider>,
  );
}

describe('<FeatureFlagProvider>', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ data: { property_compare: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    utilisateurCourant = null;
  });

  it('charge les drapeaux visibles côté client pour un utilisateur authentifié', async () => {
    utilisateurCourant = { id: 1 } as User;

    monter();

    expect(await screen.findByText('enabled')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/feature-flags/me');
  });

  it("n'appelle pas la route authentifiée pour un visiteur anonyme, et tout drapeau vaut false", async () => {
    utilisateurCourant = null;

    monter();

    expect(await screen.findByText('disabled')).toBeInTheDocument();
    // L'assertion qui compte : la route est `auth:sanctum`, un visiteur anonyme y
    // récolterait un 401 à chaque montage du provider — donc sur chaque page du site.
    // Vérifier seulement que le drapeau vaut `false` ne verrait pas cet appel-là,
    // puisqu'un 401 rend lui aussi un drapeau `false`.
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
