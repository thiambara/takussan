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
 * TCK-392 — l'en-tête porte désormais DEUX gestes, et le défaut corrigé est
 * précisément qu'on n'en voyait qu'un : le bouton « Inviter » ouvrait le
 * dialogue « compte existant », qui appelle `POST /members` et n'écrit aucune
 * ligne `invitations`. Les deux cas ci-dessous vérifient que chaque libellé
 * ouvre le dialogue qui porte son nom — *un test qui n'ouvrirait qu'« Inviter »
 * serait resté vert pendant tout le temps où « Inviter » n'invitait pas.*
 *
 * ## Pourquoi les dialogues sont bouchonnés
 *
 * Ce qu'on éprouve ici est le RACCORD, pas les formulaires : quel dialogue
 * s'ouvre, et quelles clés de cache le succès emporte. Les vrais dialogues ont
 * leurs propres schémas, leurs propres appels réseau et leurs propres tests ;
 * les traverser ferait dépendre ces assertions de trois choses qui n'ont rien à
 * voir avec elles, et un test qui rougit pour trois raisons n'en désigne aucune.
 */
function bouchon(testId: string) {
  const Bouchon = (props: { open: boolean; onSuccess?: () => void }) =>
    props.open ? (
      <button type="button" onClick={() => props.onSuccess?.()}>
        {testId}
      </button>
    ) : null;
  Bouchon.displayName = `Bouchon(${testId})`;
  return Bouchon;
}

vi.mock('@/components/admin/InviteMemberDialog', () => ({
  InviteMemberDialog: bouchon('succes-compte-existant'),
}));

vi.mock('@/components/admin/InviteAgentDialog', () => ({
  InviteAgentDialog: bouchon('succes-invitation'),
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
    vi.clearAllMocks();
  });

  /**
   * TCK-392, AC1 — le libellé « Inviter » doit ouvrir le dialogue d'INVITATION
   * (`POST /agents/invite`), pas celui qui ajoute un compte existant. C'est
   * exactement l'échange que le ticket décrit.
   */
  it('« Inviter » ouvre le dialogue d’invitation par e-mail, pas l’ajout d’un compte existant', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: /^Inviter$/ }));

    expect(screen.getByRole('button', { name: 'succes-invitation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'succes-compte-existant' })).toBeNull();
  });

  it('« Ajouter un compte existant » ouvre l’autre dialogue', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: /compte existant/i }));

    expect(screen.getByRole('button', { name: 'succes-compte-existant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'succes-invitation' })).toBeNull();
  });

  it('invalide LES DEUX listes après une invitation réussie', async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(screen.getByRole('button', { name: /^Inviter$/ }));
    await user.click(screen.getByRole('button', { name: 'succes-invitation' }));

    const cles = clesInvalidees(invalidate);
    // Le tableau des membres : une invitation acceptée y fait apparaître une ligne.
    expect(cles).toContain(JSON.stringify(['admin-users']));
    // ET la zone des invitations en attente, qui vit sous ce bouton sans le
    // connaître. C'est CELLE-CI que la mutation de la revue retirait sans
    // qu'un seul test ne bronche.
    expect(cles).toContain(JSON.stringify(['agency-invitations']));
  });

  it('invalide LES DEUX listes après l’ajout d’un compte existant', async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(screen.getByRole('button', { name: /compte existant/i }));
    await user.click(screen.getByRole('button', { name: 'succes-compte-existant' }));

    const cles = clesInvalidees(invalidate);
    expect(cles).toContain(JSON.stringify(['admin-users']));
    expect(cles).toContain(JSON.stringify(['agency-invitations']));
  });

  it("n'invalide rien tant qu'aucun geste n'a abouti", async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(screen.getByRole('button', { name: /^Inviter$/ }));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
