import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InviteMemberButton } from '../InviteMemberButton';

/**
 * TCK-368 (revue, D4) — l'invalidation CROISÉE est la seule chose que ce ticket
 * livre pour AC1, et elle n'était gardée par rien.
 *
 * Mutation exécutée par la revue : suppression des deux appels
 * `invalidateQueries({ queryKey: agencyInvitationKeys.all })` — celui d'ici et
 * celui de `TeamConsole` — → **271/271 tests verts sur 52 fichiers**. Il
 * n'existait aucun fichier de test pour ce composant. Le raccord était livré et
 * NON exécuté ; ce fichier le rend exécuté.
 *
 * ## Pourquoi le dialogue est bouchonné
 *
 * Ce qu'on éprouve ici est le RACCORD, pas le formulaire : quelles clés de
 * cache le succès d'une invitation emporte. Le vrai `InviteMemberDialog` a son
 * propre schéma, son propre appel réseau et ses propres tests ; le traverser
 * ferait dépendre cette assertion de trois choses qui n'ont rien à voir avec
 * elle, et un test qui rougit pour trois raisons n'en désigne aucune.
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

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

  render(
    withIntl(
      <QueryClientProvider client={client}>
        <InviteMemberButton agencyId={12} />
      </QueryClientProvider>,
    ),
  );

  return { invalidate };
}

/** Les clés effectivement invalidées, à plat, pour des assertions lisibles. */
function clesInvalidees(invalidate: { mock: { calls: unknown[][] } }): string[] {
  return invalidate.mock.calls.map((appel) =>
    JSON.stringify((appel[0] as { queryKey: unknown })?.queryKey),
  );
}

describe('<InviteMemberButton>', () => {
  beforeEach(() => {
    dialogProps.mockReset();
  });

  it('invalide LES DEUX listes après une invitation réussie', async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(screen.getByRole('button', { name: /Inviter/ }));
    await user.click(screen.getByRole('button', { name: 'simuler-succes' }));

    const cles = clesInvalidees(invalidate);
    // Le tableau des membres : une invitation acceptée y fait apparaître une ligne.
    expect(cles).toContain(JSON.stringify(['admin-users']));
    // ET la zone des invitations en attente, qui vit sous ce bouton sans le
    // connaître. C'est CELLE-CI que la mutation de la revue retirait sans
    // qu'un seul test ne bronche.
    expect(cles).toContain(JSON.stringify(['agency-invitations']));
  });

  it("n'invalide rien tant qu'aucune invitation n'a abouti", async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(screen.getByRole('button', { name: /Inviter/ }));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
