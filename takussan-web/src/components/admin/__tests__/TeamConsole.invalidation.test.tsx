import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { TeamConsole } from '../TeamConsole';

/**
 * TCK-368 (revue, D4) — l'autre moitié du raccord d'AC1.
 *
 * `TeamConsole.invalidateList()` invalide DEUX listes : les membres et les
 * invitations en attente. La revue a retiré l'invalidation des invitations des
 * deux côtés (ici et `InviteMemberButton`) : **271/271 verts sur 52 fichiers**,
 * aucun fichier de test n'existant pour ce composant.
 *
 * Ce fichier ne teste QUE ce raccord — d'où son nom. Le reste de la console
 * (onglets, filtres, tiroir, rôles) est un autre sujet, et un fichier qui
 * couvrirait les deux rougirait pour des raisons qu'on ne saurait plus
 * départager.
 *
 * ## Le chemin emprunté
 *
 * L'état vide de la console porte le bouton « inviter », qui ouvre
 * `InviteMemberDialog` — dont le succès appelle `invalidateList`. C'est le
 * chemin le plus court jusqu'au rappel, et c'est le chemin RÉEL d'AC1 : une
 * agence dont l'équipe est vide est exactement celle qui invite.
 */
const dialogProps = vi.fn();

vi.mock('@/components/admin/InviteMemberDialog', () => ({
  InviteMemberDialog: (props: { open: boolean; onSuccess?: () => void }) => {
    dialogProps(props);
    return props.open ? (
      <button type="button" onClick={() => props.onSuccess?.()}>
        simuler-succes
      </button>
    ) : null;
  },
}));

// La zone des invitations a ses propres tests ; ici elle n'apporterait qu'une
// requête réseau de plus à bouchonner.
vi.mock('@/components/admin/PendingInvitationsSection', () => ({
  PendingInvitationsSection: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/team',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));

vi.mock('@/hooks/useCan', () => ({
  useCan: () => ({ can: true, isLoading: false }),
}));

vi.mock('@/lib/queries/agency-roles', () => ({
  useAgencyRoleAssignments: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  agencyRoleKeys: { assignments: () => ['agency-roles', 'assignments'] },
}));

vi.mock('@/lib/queries/admin-users', () => ({
  fetchAdminUsers: () => Promise.resolve({
    data: [],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
  }),
  postUserAction: vi.fn(),
}));

vi.mock('@/lib/queries/agency-members', () => ({
  removeAgencyMember: vi.fn(),
}));

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

  render(
    withIntl(
      <QueryClientProvider client={client}>
        <TeamConsole agencyId={12} currentUserId={1} />
      </QueryClientProvider>,
    ),
  );

  return { invalidate };
}

describe('<TeamConsole> — invalidation croisée', () => {
  it('invalide LES DEUX listes quand une invitation aboutit', async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(await screen.findByRole('button', { name: /Inviter/ }));
    await user.click(await screen.findByRole('button', { name: 'simuler-succes' }));

    const cles = invalidate.mock.calls.map((appel) =>
      JSON.stringify((appel[0] as { queryKey: unknown })?.queryKey),
    );

    expect(cles).toContain(JSON.stringify(['admin-users', 'list']));
    // Sans celle-ci, l'invitation qui vient de partir n'apparaît dans la zone
    // « en attente » qu'au prochain rechargement de page : l'écran se
    // contredit lui-même.
    expect(cles).toContain(JSON.stringify(['agency-invitations']));
  });
});
