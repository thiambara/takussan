/**
 * `EspacesDuMenu` — le changement d'espace du menu du compte (TCK-2491). Ces cas viennent des tests de
 * `ProfileSwitcher`, le sélecteur de l'ancienne barre du haut, retiré avec elle (revue adverse) : ce qui
 * jugeait les ESPACES PROPOSÉS (TCK-497, TCK-329) et la bascule passe ici ; ce qui jugeait le seul
 * déclencheur (libellé statique, libellé d'admin, squelette de chargement) est parti avec lui.
 *
 * Les hooks sont les VRAIS (`useMyProfiles`, `useSwitchActiveProfile`), branchés sur un `fetch` simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { MyProfilesResponse } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { EspacesDuMenu } from '../EspacesDuMenu';

const refreshUserMock = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, refreshUser: refreshUserMock, setActiveProfileId: vi.fn() }),
}));
// `useSwitchActiveProfile` rafraîchit le routeur après une bascule réussie.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

/** Monte les espaces dans un menu, l'ouvre, et rend le client de requêtes. */
async function ouvrir(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal('fetch', fetchImpl);
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <DropdownMenu>
          <DropdownMenuTrigger>compte</DropdownMenuTrigger>
          <DropdownMenuContent>
            <EspacesDuMenu titre="Changer d’espace" />
            <p>fin du menu</p>
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    ),
  );
  const u = userEvent.setup();
  await u.click(screen.getByRole('button', { name: 'compte' }));
  await screen.findByText('fin du menu');
  // Laisser la lecture des profils aboutir.
  await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  return { u, queryClient };
}

const repondre = (body: MyProfilesResponse): typeof fetch =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

beforeEach(() => refreshUserMock.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('TCK-497 — l’espace personnel est unique', () => {
  const AGENCE_PERSO = { id: 42, name: 'Espace de Awa Diop', slug: 'espace-de-awa-diop-3', kind: 'individual' as const };
  const sortieDeLAssistantHote: MyProfilesResponse = {
    data: [
      { id: 'agency_admin:5', type: 'agency_admin', numeric_id: 5, agency_id: 42, agency: AGENCE_PERSO, status: 'active', created_at: null },
      { id: 'owner:9', type: 'owner', numeric_id: 9, agency_id: 42, agency: AGENCE_PERSO, status: 'active', created_at: null },
    ],
    meta: { active_profile_id: 'agency_admin:5', count: 2 },
  };

  it('les deux profils d’une agence personnelle ne font qu’un espace : rien à changer, rien de rendu', async () => {
    await ouvrir(repondre(sortieDeLAssistantHote));
    // Attendre que la lecture soit RENDUE : sans titre, il n'y a pas de choix.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Changer d’espace')).toBeNull();
    expect(screen.queryByText(/Espace de Awa Diop/)).toBeNull();
    expect(screen.queryByText('espace-de-awa-diop-3')).toBeNull();
  });

  it('mais une agence STANDARD garde ses deux espaces (la règle se lit dans `kind`)', async () => {
    const agencePro = { ...AGENCE_PERSO, id: 77, name: 'Agence Teranga', kind: 'standard' as const };
    await ouvrir(
      repondre({
        data: sortieDeLAssistantHote.data.map((p) => ({ ...p, agency_id: 77, agency: agencePro })),
        meta: { active_profile_id: 'agency_admin:5', count: 2 },
      }),
    );
    expect(await screen.findByTestId('espace-du-menu-owner:9')).toBeInTheDocument();
    expect(screen.getByTestId('espace-du-menu-agency_admin:5')).toHaveAttribute('aria-current', 'true');
  });
});

describe('les espaces proposés et la bascule', () => {
  it('TCK-329 AC3 — le regroupement agency_admin existe, porte un nom lisible, et propose le profil', async () => {
    await ouvrir(
      repondre({
        data: [
          { id: 'agency_admin:3', type: 'agency_admin', numeric_id: 3, agency_id: 7, agency: { id: 7, name: 'Agence Teranga', slug: 'teranga' }, status: 'active', created_at: '2026-04-22T00:00:00Z' },
          { id: 'owner:9', type: 'owner', numeric_id: 9, agency_id: 7, agency: { id: 7, name: 'Agence Teranga', slug: 'teranga' }, status: 'active', created_at: '2026-04-22T00:00:00Z' },
        ],
        meta: { active_profile_id: 'owner:9', count: 2 },
      }),
    );
    const groupe = await screen.findByRole('group', { name: 'Administrateur' });
    expect(groupe.getAttribute('aria-label')).not.toContain('undefined');
    expect(screen.getByTestId('espace-du-menu-agency_admin:3')).toBeInTheDocument();
  });

  it('choisir un autre espace bascule le profil actif (PATCH) et rafraîchit l’utilisateur', async () => {
    const body: MyProfilesResponse = {
      data: [
        { id: 'agent:5', type: 'agent', numeric_id: 5, agency_id: 7, agency: { id: 7, name: 'Acme Immo', slug: 'acme' }, status: 'active', created_at: '2026-04-22T00:00:00Z' },
        { id: 'owner:9', type: 'owner', numeric_id: 9, agency_id: 11, agency: { id: 11, name: 'Baobab Real Estate', slug: 'baobab' }, status: 'active', created_at: '2026-04-22T00:00:00Z' },
      ],
      meta: { active_profile_id: 'agent:5', count: 2 },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('/api/me/active-profile') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ data: body.data[1] }), { status: 200 });
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const { u } = await ouvrir(fetchMock);
    await u.click(await screen.findByTestId('espace-du-menu-owner:9'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/me/active-profile', expect.objectContaining({ method: 'PATCH' })),
    );
    await waitFor(() => expect(refreshUserMock).toHaveBeenCalled());
  });
});

describe('TCK-2621 — « rôle · ville », coché, jamais le slug', () => {
  const corps: MyProfilesResponse = {
    data: [
      { id: 'agent:5', type: 'agent', numeric_id: 5, agency_id: 1, agency: { id: 1, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard', city: 'Dakar' }, status: 'active', created_at: null },
      { id: 'owner:9', type: 'owner', numeric_id: 9, agency_id: 2, agency: { id: 2, name: 'Thiès Properties', slug: 'thies-properties', kind: 'standard', city: null }, status: 'active', created_at: null },
    ],
    meta: { active_profile_id: 'owner:9', count: 2 },
  };

  it('chaque ligne : agence, puis « rôle · ville » (le rôle seul sans ville) ; aucun slug', async () => {
    await ouvrir(repondre(corps));
    const dakar = await screen.findByTestId('espace-du-menu-agent:5');
    expect(dakar).toHaveTextContent('Dakar Immo');
    expect(dakar).toHaveTextContent('Agent · Dakar');
    const thies = screen.getByTestId('espace-du-menu-owner:9');
    expect(thies).toHaveTextContent(/Propriétaire$/);
    const menu = screen.getByRole('menu');
    expect(menu.textContent).not.toMatch(/dakar-immo|thies-properties/);
  });

  it('l’espace actif porte la coche (et `aria-current`), l’autre un cercle vide', async () => {
    await ouvrir(repondre(corps));
    const actif = await screen.findByTestId('espace-du-menu-owner:9');
    expect(actif).toHaveAttribute('aria-current', 'true');
    expect(actif.querySelector('svg.lucide-check')).not.toBeNull();
    expect(screen.getByTestId('espace-du-menu-agent:5').querySelector('svg.lucide-check')).toBeNull();
  });
});

