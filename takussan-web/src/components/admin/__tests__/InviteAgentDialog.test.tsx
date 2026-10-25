import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { useCan } from '@/hooks/useCan';
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

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

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
    vi.mocked(useCan).mockReturnValue({ can: false, isLoading: false });
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
   * P234.01 (TCK-2280) — « Agent senior » et « Responsable d'équipe » n'étaient jamais appliqués :
   * le membre entrait comme simple agent. Le dialogue ne les offre plus.
   */
  it('n’offre plus de rôle sans effet : ni agent senior, ni responsable d’équipe', async () => {
    monter();
    await userEvent.setup().click(screen.getByLabelText('Rôle'));

    expect(await screen.findByRole('option', { name: 'Agent' })).toBeInTheDocument();
    expect(screen.queryByText(/Agent senior/)).toBeNull();
    expect(screen.queryByText(/Responsable d'équipe/)).toBeNull();
  });

  /**
   * TCK-2365 (P242.01) — l'invitation est le seul chemin d'entrée dans l'équipe, au rôle agent ou
   * administrateur ; le renvoi vers « Ajouter un compte existant » est parti avec ce geste.
   * « Administrateur » suit `team.assign_role`, que l'API juge (TCK-2205).
   */
  it('sans team.assign_role, seul « Agent » est proposé', async () => {
    monter();
    await userEvent.setup().click(screen.getByLabelText('Rôle'));

    expect(await screen.findByRole('option', { name: 'Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Administrateur' })).toBeNull();
    expect(screen.queryByText(/Ajouter un compte existant/)).toBeNull();
    expect(useCan).toHaveBeenCalledWith('team.assign_role', 7, true);
  });

  it('avec team.assign_role, l’invitation part au rôle administrateur choisi', async () => {
    vi.mocked(useCan).mockReturnValue({ can: true, isLoading: false });
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText(/Prénom/i), 'Awa');
    await user.type(screen.getByLabelText(/^Nom$/i), 'Ndiaye');
    await user.type(screen.getByLabelText(/^Email$/i), 'awa@exemple.sn');
    await user.click(screen.getByLabelText('Rôle'));
    await user.click(await screen.findByRole('option', { name: 'Administrateur' }));
    await user.click(screen.getByRole('button', { name: /^Envoyer/i }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledTimes(1));
    expect(vi.mocked(inviteAgencyAgent).mock.calls[0][1]).toMatchObject({ role: 'agency_admin' });
  });

  /**
   * ⚠ Ce cas assert l'ABSENCE d'appel réseau, et **pas** l'affichage d'un message.
   *
   * Mesuré en implémentant TCK-392 : un e-mail invalide bloque bien la soumission
   * (`inviteAgencyAgent` non appelé) mais n'affiche AUCUN message —
   * `document.querySelectorAll('[role="alert"]').length === 0`. Le défaut n'est pas
   * dans ce composant : `InviteMemberDialog` (TCK-292, retiré depuis par TCK-2365)
   * se comportait à l'identique dans le même harnais, alors que le même schéma passé
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
