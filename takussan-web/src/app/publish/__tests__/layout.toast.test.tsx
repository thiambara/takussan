/**
 * `/publish` plantait au rendu sur preview (2026-10-10) : « Base UI error #73 », la frontière
 * d'erreur à la place de la page. La page bascule le profil par `useSwitchActiveProfile`, qui
 * appelle `useToast()` ; le layout ne montait aucun fournisseur de toasts.
 *
 * Le test rend le VRAI layout autour de la VRAIE page, avec le vrai hook de bascule : seule la
 * décision (`usePublishIntent`) est fixée, sur le choix d'espace, pour que rien ne navigue.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/i18n/messages', async () => ({
  messagesPour: async () => (await import('@/messages/fr.json')).default,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, isLoading: false, refreshUser: vi.fn() }),
}));

vi.mock('@/hooks/usePublishIntent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePublishIntent')>()),
  usePublishIntent: () => ({
    status: 'choose-space',
    target: null,
    profilABasculer: null,
    espaces: [
      { agencyId: 1, profile: { id: 'p1', type: 'agency_admin', agency_id: 1, agency: { name: 'Agence Dakar' } } },
      { agencyId: 2, profile: { id: 'p2', type: 'owner', agency_id: 2, agency: { name: 'Agence Thiès' } } },
    ],
  }),
}));

const { default: PublishLayout } = await import('../layout');
const { default: PublishPage } = await import('../page');

describe('/publish — le layout porte ce que la page consomme', () => {
  it('rend le choix de l’espace, sans tomber sur la frontière d’erreur', async () => {
    const client = new QueryClient();
    render(
      withIntl(
        <QueryClientProvider client={client}>
          {await PublishLayout({ children: <PublishPage /> })}
        </QueryClientProvider>,
      ),
    );

    expect(screen.getByText('Agence Dakar')).toBeInTheDocument();
    expect(screen.getByText('Agence Thiès')).toBeInTheDocument();
  });
});
