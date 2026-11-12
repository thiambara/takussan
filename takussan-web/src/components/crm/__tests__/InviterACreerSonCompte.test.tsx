/**
 * P15.01 (TCK-2351) — « inviter le locataire à créer son compte », depuis la fiche : le geste
 * part une fois, dit qu'il est parti, et affiche le refus de l'API tel qu'elle le dit.
 *
 * TCK-2668 — l'invitation déjà partie se lit sur la fiche (envoyée le, expire le ; expirée) avec
 * « Relancer » et « Annuler » : la page Équipe ne liste plus les invitations de locataires.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import type { PendingAgencyInvitation } from '@/lib/queries/agency-invitations';
import { withIntl } from '@/test/intl';
import { InviterACreerSonCompte } from '../InviterACreerSonCompte';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const inviteCustomerToAccount = vi.fn();
vi.mock('@/lib/queries/customers', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customers')>()),
  inviteCustomerToAccount: (...a: unknown[]) => inviteCustomerToAccount(...a),
}));
const fetchInvitationDuClient = vi.fn();
const resendInvitation = vi.fn();
const revokeInvitation = vi.fn();
vi.mock('@/lib/queries/agency-invitations', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agency-invitations')>()),
  fetchInvitationDuClient: (...a: unknown[]) => fetchInvitationDuClient(...a),
  resendInvitation: (...a: unknown[]) => resendInvitation(...a),
  revokeInvitation: (...a: unknown[]) => revokeInvitation(...a),
}));

const EXPIREE: PendingAgencyInvitation = {
  id: 77,
  email: 'client@exemple.sn',
  role: 'tenant',
  status: 'expired',
  agency_id: 12,
  invitable_type: null,
  invitable_id: null,
  expires_at: '2026-11-09T10:00:00Z',
  created_at: '2026-11-02T10:00:00Z',
  is_expired: true,
  abilities: { resend: true, revoke: true },
};

function rendu(garde?: GardeDoubleFacteurFn) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const arbre = (
    <QueryClientProvider client={client}>
      <InviterACreerSonCompte customerId={9} />
    </QueryClientProvider>
  );
  render(withIntl(garde ? <ContexteGardeDoubleFacteur.Provider value={garde}>{arbre}</ContexteGardeDoubleFacteur.Provider> : arbre));
}

describe('InviterACreerSonCompte', () => {
  beforeEach(() => {
    inviteCustomerToAccount.mockReset();
    fetchInvitationDuClient.mockReset().mockResolvedValue(null);
    resendInvitation.mockReset().mockResolvedValue({});
    revokeInvitation.mockReset().mockResolvedValue({});
  });

  it('envoie l’invitation de la fiche, puis dit qu’elle est partie et ne repart pas', async () => {
    inviteCustomerToAccount.mockResolvedValue(undefined);
    rendu();

    await userEvent.click(await screen.findByRole('button', { name: 'Inviter à créer son compte' }));

    await waitFor(() => expect(inviteCustomerToAccount).toHaveBeenCalledWith('jeton', 9));
    expect(await screen.findByRole('status')).toHaveTextContent('Invitation envoyée.');
    expect(screen.queryByRole('button', { name: 'Inviter à créer son compte' })).toBeNull();
  });

  it('une invitation envoyée relue après l’envoi prend la place du bouton', async () => {
    inviteCustomerToAccount.mockResolvedValue(undefined);
    rendu();
    fetchInvitationDuClient.mockResolvedValue({
      ...EXPIREE,
      status: 'sent',
      is_expired: false,
      expires_at: '2026-11-19T10:00:00Z',
      created_at: '2026-11-12T10:00:00Z',
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Inviter à créer son compte' }));

    expect(await screen.findByTestId('invitation-du-client')).toHaveTextContent('Invitation envoyée · envoyée le 12 nov. · expire le 19 nov.');
  });

  it('affiche le refus de l’API tel qu’elle le dit', async () => {
    inviteCustomerToAccount.mockRejectedValue(
      new ApiError(409, {
        code: 'customer.invite_already_linked',
        message: 'Cette fiche est déjà rattachée à un compte : il n’y a personne à inviter.',
      }),
    );
    rendu();

    await userEvent.click(await screen.findByRole('button', { name: 'Inviter à créer son compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette fiche est déjà rattachée à un compte');
    expect(screen.getByRole('button', { name: 'Inviter à créer son compte' })).toBeEnabled();
  });

  it('AC4 — une invitation expirée se lit et se relance (`POST /api/invitations/{id}/resend`)', async () => {
    fetchInvitationDuClient.mockResolvedValue(EXPIREE);
    rendu();

    const bloc = await screen.findByTestId('invitation-du-client');
    expect(bloc).toHaveTextContent('Invitation expirée · le 9 nov.');
    expect(screen.queryByRole('button', { name: 'Inviter à créer son compte' })).toBeNull();
    await userEvent.click(within(bloc).getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(resendInvitation).toHaveBeenCalledWith('jeton', 77));
    expect(fetchInvitationDuClient).toHaveBeenCalledWith('jeton', 9);
  });

  it('« Annuler » confirme, puis révoque, sous la garde du second facteur', async () => {
    fetchInvitationDuClient.mockResolvedValue(EXPIREE);
    revokeInvitation.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }));
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    rendu(garde);

    await userEvent.click(within(await screen.findByTestId('invitation-du-client')).getByRole('button', { name: 'Annuler' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Annuler l'invitation" }));

    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledTimes(1);
  });

  // Vérification de 776dc214f (F9) — « Relancer » refusé faute de second facteur passe par la garde,
  // puis est rejoué.
  it('« Relancer » passe par la garde du second facteur, puis est rejoué', async () => {
    fetchInvitationDuClient.mockResolvedValue(EXPIREE);
    resendInvitation.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }));
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    rendu(garde);

    await userEvent.click(within(await screen.findByTestId('invitation-du-client')).getByRole('button', { name: 'Relancer' }));

    await waitFor(() => expect(resendInvitation).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
  });

  // Vérification de 776dc214f (D1) — les gestes suivent `abilities` : l'API les refuse à qui n'a ni
  // envoyé l'invitation ni `team.invite`, l'écran ne les offre pas, et dit à qui s'adresser.
  it('sans les gestes de l’API, l’état se lit sans bouton, et la phrase dit à qui s’adresser', async () => {
    fetchInvitationDuClient.mockResolvedValue({ ...EXPIREE, abilities: { resend: false, revoke: false } });
    rendu();

    const bloc = await screen.findByTestId('invitation-du-client');
    expect(bloc).toHaveTextContent('Invitation expirée · le 9 nov.');
    expect(within(bloc).queryByRole('button')).toBeNull();
    expect(bloc).toHaveTextContent('Seul l’auteur de l’invitation ou un administrateur de l’agence peut la relancer ou l’annuler.');
  });

  it('une seule des deux : seul ce geste s’offre', async () => {
    fetchInvitationDuClient.mockResolvedValue({ ...EXPIREE, abilities: { resend: true, revoke: false } });
    rendu();

    const bloc = await screen.findByTestId('invitation-du-client');
    expect(within(bloc).getByRole('button', { name: 'Relancer' })).toBeInTheDocument();
    expect(within(bloc).queryByRole('button', { name: 'Annuler' })).toBeNull();
  });
});
