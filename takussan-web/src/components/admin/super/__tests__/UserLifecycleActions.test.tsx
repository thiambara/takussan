import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes, SUPER_ADMIN } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { AdminUserDetail } from '@/types/super-admin';
import { UserLifecycleActions } from '../UserLifecycleActions';
import { UserDetailHeader } from '../user-detail';

const VIEWER: PlatformAbilities = { level: 'viewer', abilities: ['platform.console.access', 'platform.agencies.view'] };
const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: ['platform.console.access', 'platform.users.view', 'platform.users.support', 'platform.users.block'],
};

function rendre(noeud: React.ReactNode, gestes: PlatformAbilities = SUPER_ADMIN) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {avecGestes(noeud, gestes)}
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const boutons = () => screen.queryAllByRole('button').map((b) => b.textContent?.trim());

async function confirmer(bouton: string, phrase: string, motif: string) {
  const u = userEvent.setup();
  await u.click(screen.getByRole('button', { name: bouton }));
  await u.type(screen.getByTestId('confirm-action-reason'), motif);
  await u.type(screen.getByTestId('confirm-action-input'), phrase);
  await u.click(screen.getByTestId('confirm-action-submit'));
}

afterEach(() => vi.unstubAllGlobals());

/** TCK-600 (sous-partie 3) — « Bloquer », « Réactiver », « Effacer le compte » sur la fiche. */
describe('UserLifecycleActions', () => {
  it('propose selon le niveau : support bloque, seul le super_admin efface, un viewer rien', () => {
    const { unmount } = rendre(<UserLifecycleActions userId={5} status="active" />, SUPPORT);
    expect(boutons()).toEqual(['Bloquer']);
    unmount();

    const second = rendre(<UserLifecycleActions userId={5} status="active" />);
    expect(boutons()).toEqual(['Bloquer', 'Effacer le compte']);
    second.unmount();

    rendre(<UserLifecycleActions userId={5} status="active" />, VIEWER);
    expect(boutons()).toEqual([]);
  });

  it('un compte bloqué se réactive ; un compte effacé n’offre rien', () => {
    const { unmount } = rendre(<UserLifecycleActions userId={5} status="blocked" />);
    expect(boutons()).toEqual(['Réactiver', 'Effacer le compte']);
    unmount();

    rendre(<UserLifecycleActions userId={5} status="deleted" />);
    expect(boutons()).toEqual([]);
  });

  it('bloquer envoie le motif', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: 'blocked' } })));
    vi.stubGlobal('fetch', fetchMock);
    rendre(<UserLifecycleActions userId={5} status="active" />, SUPPORT);

    await confirmer('Bloquer', 'BLOQUER', 'Fraude signalée par trois agences.');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/super-admin/users/5/block');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Fraude signalée par trois agences.' });
  });

  it('un effacement refusé liste les obligations ouvertes, dans la modale', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'account_deletion.has_obligations',
            message: 'Ce compte a des obligations en cours.',
            obligations: [{ type: 'lease', id: 41, label: 'Bail actif BAIL-2026-041' }],
          }),
          { status: 422 },
        ),
      ),
    );
    rendre(<UserLifecycleActions userId={5} status="active" />);

    await confirmer('Effacer le compte', 'EFFACER', 'Demande écrite reçue par courrier.');

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Ce compte a des obligations en cours.');
    expect(alerte).toHaveTextContent('Bail actif BAIL-2026-041');
  });

  it('un effacement accepté annonce sa date planifiée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 1, user_id: 5, scheduled_for: '2026-11-07T10:00:00+00:00' } }), {
          status: 202,
        }),
      ),
    );
    rendre(<UserLifecycleActions userId={5} status="active" />);

    await confirmer('Effacer le compte', 'EFFACER', 'Demande écrite reçue par courrier.');

    expect(await screen.findByText('Effacement planifié le 7 nov. 2026.')).toBeInTheDocument();
  });
});

describe('fiche utilisateur — gestes de support filtrés par niveau (TCK-600)', () => {
  const user = {
    id: 5,
    full_name: 'Fatou Diop',
    email: 'fatou@example.test',
    status: 'active',
    roles: [],
    mfa_enabled: false,
  } as unknown as AdminUserDetail;

  it('un viewer ne voit ni les gestes de support ni l’export', () => {
    rendre(<UserDetailHeader user={user} />, VIEWER);
    expect(boutons()).toEqual([]);
  });

  it('un support voit les gestes de support, pas l’export RGPD', () => {
    rendre(<UserDetailHeader user={user} />, SUPPORT);
    expect(screen.getByRole('button', { name: /Bloquer/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /RGPD|export/i })).toBeNull();
    expect(boutons().length).toBeGreaterThan(1);
  });
});
