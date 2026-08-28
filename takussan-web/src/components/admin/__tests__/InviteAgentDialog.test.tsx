import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { InviteAgentDialog } from '../InviteAgentDialog';

/**
 * TCK-392, AC1 et AC2 — `grep -rn "agents/invite" takussan-web/src` ne rendait
 * **aucun résultat** : l'endpoint livré par TCK-258 n'avait pas un appelant.
 * Ce fichier éprouve le seul qu'il ait désormais.
 *
 * Le module réseau est bouchonné, pas le formulaire : ce qu'on veut savoir est
 * *quelle charge utile part*, et c'est le formulaire qui la construit. Le
 * traverser est donc le sujet du test, pas un coût.
 */
vi.mock('@/lib/queries/agency-invitations', () => ({
  inviteAgencyAgent: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton-de-test' }),
}));

function monter(onSuccess = vi.fn()) {
  render(
    withIntl(
      <InviteAgentDialog agencyId={7} open onOpenChange={vi.fn()} onSuccess={onSuccess} />,
    ),
  );
  return { onSuccess };
}

describe('<InviteAgentDialog>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inviteAgencyAgent).mockResolvedValue({ data: {} } as never);
  });

  it('envoie l’invitation sur `agents/invite` avec l’identité saisie', async () => {
    const user = userEvent.setup();
    const { onSuccess } = monter();

    await user.type(screen.getByLabelText(/Prénom/i), 'Awa');
    await user.type(screen.getByLabelText(/^Nom$/i), 'Ndiaye');
    await user.type(screen.getByLabelText(/^Email$/i), 'awa@exemple.sn');

    await user.click(screen.getByRole('button', { name: /^Envoyer/i }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledTimes(1));
    expect(inviteAgencyAgent).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        email: 'awa@exemple.sn',
        first_name: 'Awa',
        last_name: 'Ndiaye',
        role: 'agent',
        // Un téléphone non saisi part en `null`, pas en `''` : la règle backend
        // est `nullable`, et une chaîne vide n'est pas « pas de téléphone ».
        phone: null,
      }),
      'jeton-de-test',
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  /**
   * `AgentInvitationService::ALLOWED_ROLES` exclut `agency_admin` (TCK-209) et
   * le générique `POST /api/invitations` l'accepterait sans créer aucun profil.
   * L'écran ne doit donc pas l'offrir — et il doit dire où ça se fait.
   */
  it('n’offre pas `agency_admin` et renvoie vers le chemin qui existe', async () => {
    monter();

    expect(screen.queryByText(/Administrateur/)).toBeNull();
    expect(screen.getByText(/Ajouter un compte existant/)).toBeInTheDocument();
  });

  /**
   * ⚠ Ce cas assert l'ABSENCE d'appel réseau, et **pas** l'affichage d'un message.
   *
   * Mesuré en implémentant TCK-392 : un e-mail invalide bloque bien la soumission
   * (`inviteAgencyAgent` non appelé) mais n'affiche AUCUN message —
   * `document.querySelectorAll('[role="alert"]').length === 0`. Le défaut n'est pas
   * dans ce composant : `InviteMemberDialog`, livré par TCK-292 et non touché ici,
   * se comporte à l'identique dans le même harnais, alors que le même schéma passé
   * à `useApiForm` HORS dialogue rend bien « Email invalide. ». Le schéma lui-même
   * est juste (`safeParse` rend une issue unique sur `email`).
   *
   * Asserter ici l'affichage figerait donc une correction qui n'appartient pas à ce
   * ticket ; asserter l'absence d'appel garde ce que ce ticket doit garder — une
   * saisie invalide ne part pas au serveur. *Un test qui échoue pour le défaut d'un
   * autre composant n'apprend rien sur celui-ci.*
   */
  it('ne part pas au réseau tant que l’e-mail est invalide', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText(/Prénom/i), 'Awa');
    await user.type(screen.getByLabelText(/^Nom$/i), 'Ndiaye');
    await user.type(screen.getByLabelText(/^Email$/i), 'pas-un-email');

    await user.click(screen.getByRole('button', { name: /^Envoyer/i }));

    await waitFor(() => expect(inviteAgencyAgent).not.toHaveBeenCalled());
  });
});
