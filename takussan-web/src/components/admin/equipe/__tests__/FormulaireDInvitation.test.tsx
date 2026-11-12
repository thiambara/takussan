import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { Button } from '@/components/ui/button';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { useCan } from '@/hooks/useCan';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { withIntl } from '@/test/intl';

import { FormulaireDInvitation } from '../FormulaireDInvitation';

/**
 * TCK-2668 — « Inviter un membre » sur l'écran des invitations, qui remplace `InviteAgentDialog`
 * (TCK-392) et en garde les règles : `agents/invite` avec l'identité saisie (TCK-392), deux rôles
 * dont « Administrateur » sous `team.assign_role` (TCK-2280, TCK-2365), rien au réseau sur une
 * saisie invalide, la double authentification (TCK-761). Le module réseau est bouchonné, pas le
 * formulaire : ce qu'on veut savoir est quelle charge utile part.
 */
vi.mock('@/lib/queries/agency-invitations', () => ({ inviteAgencyAgent: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton-de-test' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

function monter(garde?: GardeDoubleFacteurFn) {
  const onEnvoyee = vi.fn();
  const arbre = (
    <ToastProvider>
      <FormulaireDInvitation id="inviter" agencyId={7} onEnvoyee={onEnvoyee} envoi={() => <Button type="submit">Envoyer l’invitation</Button>} />
      <Toaster />
    </ToastProvider>
  );
  render(withIntl(garde ? <ContexteGardeDoubleFacteur.Provider value={garde}>{arbre}</ContexteGardeDoubleFacteur.Provider> : arbre));
  return { onEnvoyee };
}

async function remplir(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Prénom'), 'Awa');
  await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
  await user.type(screen.getByLabelText('Adresse e-mail'), 'awa@exemple.sn');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inviteAgencyAgent).mockResolvedValue({ data: {} } as never);
  vi.mocked(useCan).mockReturnValue({ can: false, isLoading: false });
});

describe('FormulaireDInvitation', () => {
  it('envoie l’invitation sur `agents/invite` avec l’identité saisie, puis le dit et se vide', async () => {
    const user = userEvent.setup();
    const { onEnvoyee } = monter();
    await remplir(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledTimes(1));
    expect(inviteAgencyAgent).toHaveBeenCalledWith(
      7,
      { email: 'awa@exemple.sn', first_name: 'Awa', last_name: 'Ndiaye', role: 'agent', phone: null },
      'jeton-de-test',
    );
    await waitFor(() => expect(onEnvoyee).toHaveBeenCalled());
    expect(await screen.findByText('Invitation envoyée à awa@exemple.sn.')).toBeInTheDocument();
    expect(screen.getByLabelText('Prénom')).toHaveValue('');
  });

  it('sans team.assign_role, seul « Agent » est proposé, avec ce que le rôle permet', () => {
    monter();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /Agent/ })).toBeChecked();
    expect(screen.getByText('Ses biens, ses clients, ses visites.')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Administrateur/ })).toBeNull();
  });

  it('avec team.assign_role, l’invitation part au rôle administrateur choisi', async () => {
    vi.mocked(useCan).mockReturnValue({ can: true, isLoading: false });
    const user = userEvent.setup();
    monter();
    await remplir(user);
    await user.click(screen.getByRole('radio', { name: /Administrateur/ }));
    await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledWith(7, expect.objectContaining({ role: 'agency_admin' }), 'jeton-de-test'));
    expect(useCan).toHaveBeenCalledWith('team.assign_role', 7);
  });

  it('ne part pas au réseau tant que l’e-mail est invalide, et l’erreur est reliée au champ', async () => {
    const user = userEvent.setup();
    monter();
    await user.type(screen.getByLabelText('Prénom'), 'Awa');
    await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'pas-un-email');
    await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    const champ = screen.getByLabelText('Adresse e-mail');
    await waitFor(() => expect(champ).toHaveAttribute('aria-invalid', 'true'));
    expect(champ).toHaveAccessibleDescription('Email invalide.');
    expect(inviteAgencyAgent).not.toHaveBeenCalled();
  });

  it('ne dit plus « choisit son mot de passe » : la phrase vaut pour les deux parcours d’entrée', () => {
    monter();
    expect(screen.getByText(/Le lien d’invitation reste valable 7 jours/)).toBeInTheDocument();
    expect(screen.queryByText(/mot de passe/)).toBeNull();
  });

  it('un refus de second facteur ouvre la garde, puis l’invitation est rejouée', async () => {
    vi.mocked(inviteAgencyAgent)
      .mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }))
      .mockResolvedValueOnce({ data: {} } as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const user = userEvent.setup();
    const { onEnvoyee } = monter(garde);
    await remplir(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onEnvoyee).toHaveBeenCalled());
  });
});
