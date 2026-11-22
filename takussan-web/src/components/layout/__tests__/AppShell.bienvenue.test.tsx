/**
 * TCK-1477 (P101.03) — une seule fenêtre de bienvenue à la fois pour le client et le locataire.
 *
 * Mesuré le 2026-10-21 : `AppShell` montait le parcours client et celui du locataire sous la même
 * condition, et un locataire sans aucune clé vue recevait deux `dialog` modaux ouverts ensemble.
 * Décision du porteur : le parcours client d'abord, celui du locataire à sa fermeture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';
import { AppShell } from '../AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false, logout: vi.fn() }),
}));

// La chrome de la console est hors sujet : seules les deux fenêtres de bienvenue restent réelles.
vi.mock('../EnTeteMobile', () => ({ EnTeteMobile: () => null }));
vi.mock('../AppSidebar', () => ({ AppSidebar: () => null }));
// TCK-2481 — la barre d'onglets compose le menu et sonde ses compteurs, comme la barre latérale :
// ce fichier ne compte que les lectures des assistants.
vi.mock('../BarreDOnglets', () => ({ BarreDOnglets: () => null }));
vi.mock('@/components/announcements/BandeauxDuSite', () => ({ BandeauxDuSite: () => null }));
vi.mock('@/components/admin/super/ImpersonationBanner', () => ({
  ImpersonationBanner: () => null,
}));
vi.mock('@/components/customer/MinimalProfileTriggerProvider', () => ({
  MinimalProfileTriggerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/queries/leases-active-summaries', () => ({
  useActiveLeaseSummaries: () => ({ data: { data: [{ id: 7, reference_number: 'B-7' }] } }),
}));

const locataire = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  email: 'awa@example.test',
  roles: ['customer'],
} as unknown as User;

function stubVues(vues: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => (init?.method === 'POST' ? {} : { data: vues }),
    })),
  );
}

function rendre() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        {/* TCK-2480 — le fournisseur des préférences du menu, monté par la coque, dit ses échecs par
            un toast : le `ToastProvider` du groupe `(dashboard)`. */}
        <ToastProvider>
          <AppShell user={locataire}>
            <p>contenu</p>
          </AppShell>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('AppShell — fenêtres de bienvenue du client et du locataire (TCK-1477)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('locataire sans clé vue : le parcours client seul, puis celui du locataire à sa fermeture', async () => {
    stubVues([]);
    rendre();

    await screen.findByText('Trouvez le bien parfait');
    // Laisse au parcours locataire le temps de lire ses clés, s'il était monté.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByText('Vos paiements')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('welcome-skip'));

    await screen.findByText('Vos paiements');
    await waitFor(() => expect(screen.queryByText('Trouvez le bien parfait')).not.toBeInTheDocument());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('parcours client déjà vu : le parcours locataire s’ouvre directement', async () => {
    stubVues(['customer-welcome']);
    rendre();

    await screen.findByText('Vos paiements');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByText('Trouvez le bien parfait')).not.toBeInTheDocument();
  });
});
