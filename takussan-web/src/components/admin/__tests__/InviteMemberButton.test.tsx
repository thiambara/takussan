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
 * TCK-392 — le bouton « Inviter » ouvrait le dialogue « compte existant », qui
 * appelait `POST /members` et n'écrivait aucune ligne `invitations`. TCK-2365
 * (P242.01) a retiré ce rattachement direct : « Inviter » est le seul geste, et
 * il ouvre le dialogue d'invitation.
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

vi.mock('@/components/admin/InviteAgentDialog', () => ({
  InviteAgentDialog: bouchon('succes-invitation'),
}));

// TCK-1412 — les capacités du profil actif, réglées par cas.
let capacites: string[] = [];
vi.mock('@/hooks/useCan', () => ({
  useCan: (capability: string) => ({ can: capacites.includes(capability), isLoading: false }),
}));

function monter(estAdmin?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

  render(
    withIntl(
      <QueryClientProvider client={client}>
        <InviteMemberButton agencyId={12} {...(estAdmin === undefined ? {} : { estAdmin })} />
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
    capacites = [];
  });

  /**
   * TCK-1412 (P148.02) — la page Équipe s'ouvre à un agent qui tient `team.invite` : il invite
   * (`AgentProfilePolicy::invite` juge la capacité).
   */
  it('un non-admin qui tient team.invite voit « Inviter »', () => {
    capacites = ['team.invite'];
    monter(false);
    expect(screen.getByRole('button', { name: /^Inviter$/ })).toBeInTheDocument();
  });

  it('un non-admin sans team.invite ne voit aucun geste', () => {
    capacites = ['team.suspend'];
    monter(false);
    expect(screen.queryByRole('button', { name: /^Inviter$/ })).toBeNull();
  });

  /**
   * TCK-2365 (P242.01) — « Ajouter un compte existant » rattachait un compte sans son accord, par
   * `POST /members`, retirée : l'admin n'a plus que l'invitation.
   */
  it("l'admin n'a plus que « Inviter » : le rattachement direct est retiré", () => {
    monter(true);
    expect(screen.getByRole('button', { name: /^Inviter$/ })).toBeInTheDocument();
    // Compté, et non cherché par son libellé : la clé partie avec le geste, le bouton
    // ressuscité s'afficherait sous sa clé brute, que « compte existant » ne trouve pas.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('« Inviter » ouvre le dialogue d’invitation', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: /^Inviter$/ }));

    expect(screen.getByRole('button', { name: 'succes-invitation' })).toBeInTheDocument();
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

  it("n'invalide rien tant qu'aucun geste n'a abouti", async () => {
    const user = userEvent.setup();
    const { invalidate } = monter();

    await user.click(screen.getByRole('button', { name: /^Inviter$/ }));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
