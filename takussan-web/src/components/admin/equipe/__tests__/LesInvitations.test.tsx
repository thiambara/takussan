import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import type { PendingAgencyInvitation } from '@/lib/queries/agency-invitations';
import { withIntl } from '@/test/intl';

import { LesInvitations } from '../LesInvitations';

/**
 * TCK-2668 — l'écran des invitations de l'Équipe : « En cours · N » (relancer sans confirmation,
 * annuler confirmé), « Expirées · N » repliées avec « Tout effacer » (confirmation qui dit le
 * nombre), et le formulaire. Les gestes de `PendingInvitationsSection` (TCK-368) restent : la
 * pagination, le compte du serveur, la double authentification, les gestes cachés sans capacité.
 */
const AGENCE = 12;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }) }));
vi.mock('../FormulaireDInvitation', () => ({ FormulaireDInvitation: () => <p data-testid="formulaire" /> }));

const fetchPendingAgencyInvitations = vi.fn();
const resendInvitation = vi.fn();
const revokeInvitation = vi.fn();
const purgeExpiredAgencyInvitations = vi.fn();
vi.mock('@/lib/queries/agency-invitations', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agency-invitations')>()),
  fetchPendingAgencyInvitations: (...a: unknown[]) => fetchPendingAgencyInvitations(...a),
  resendInvitation: (...a: unknown[]) => resendInvitation(...a),
  revokeInvitation: (...a: unknown[]) => revokeInvitation(...a),
  purgeExpiredAgencyInvitations: (...a: unknown[]) => purgeExpiredAgencyInvitations(...a),
}));

const invitation = (id: number, e: Partial<PendingAgencyInvitation> = {}): PendingAgencyInvitation => ({
  id,
  email: `invite${id}@exemple.sn`,
  role: 'agent',
  status: 'sent',
  agency_id: AGENCE,
  invitable_type: null,
  invitable_id: null,
  expires_at: '2026-11-14T10:00:00Z',
  created_at: '2026-11-07T10:00:00Z',
  is_expired: false,
  ...e,
});
const page = (data: PendingAgencyInvitation[], total = data.length, courante = 1, derniere = 1) => ({
  data,
  meta: { total, current_page: courante, last_page: derniere, per_page: 10 },
});

let enCours: ReturnType<typeof page>;
let expirees: ReturnType<typeof page>;

function monter(e: { peutGerer?: boolean; telephone?: boolean; garde?: GardeDoubleFacteurFn } = {}) {
  const arbre = (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <LesInvitations agencyId={AGENCE} peutGerer={e.peutGerer ?? true} peutInviter telephone={e.telephone ?? false} />
        <Toaster />
      </ToastProvider>
    </QueryClientProvider>
  );
  return render(withIntl(e.garde ? <ContexteGardeDoubleFacteur.Provider value={e.garde}>{arbre}</ContexteGardeDoubleFacteur.Provider> : arbre));
}

beforeEach(() => {
  enCours = page([invitation(1, { email: 'moussa.ba@exemple.sn' })]);
  expirees = page(
    [1, 2, 3, 4, 5].map((n) => invitation(10 + n, { status: 'expired', is_expired: true, expires_at: '2026-10-12T10:00:00Z' })),
    28,
    1,
    6,
  );
  fetchPendingAgencyInvitations
    .mockReset()
    .mockImplementation(async (_t: string, p: { statut: string; page: number; perPage: number }) =>
      p.statut === 'sent' ? enCours : p.perPage > 5 ? page(expirees.data, 28, p.page, 2) : expirees,
    );
  resendInvitation.mockReset().mockResolvedValue({});
  revokeInvitation.mockReset().mockResolvedValue({});
  purgeExpiredAgencyInvitations.mockReset().mockResolvedValue(28);
});

describe('LesInvitations', () => {
  it('« En cours · 1 » : destinataire, rôle en clair, envoyée le, expire le', async () => {
    monter();
    expect(await screen.findByRole('heading', { name: 'En cours · 1' })).toBeInTheDocument();
    const ligne = screen.getByTestId('invitation-en-cours-1');
    expect(ligne).toHaveTextContent('moussa.ba@exemple.sn');
    expect(ligne).toHaveTextContent('Agent · envoyée le 7 nov. · expire le 14 nov.');
    expect(fetchPendingAgencyInvitations).toHaveBeenCalledWith('jeton', { statut: 'sent', page: 1, perPage: 10 });
  });

  it('AC3 — « Expirées · 28 », repliées à cinq, et la suite se déplie', async () => {
    monter();
    expect(await screen.findByRole('heading', { name: 'Expirées · 28' })).toBeInTheDocument();
    expect(screen.getAllByTestId(/invitation-expiree-/)).toHaveLength(5);
    expect(screen.getByTestId('invitation-expiree-11')).toHaveTextContent('Agent · expirée le 12 oct.');
    await userEvent.click(screen.getByRole('button', { name: 'et 23 autres, plus anciennes' }));
    await waitFor(() => expect(fetchPendingAgencyInvitations).toHaveBeenCalledWith('jeton', { statut: 'expired', page: 1, perPage: 20 }));
  });

  it('AC3 — « Tout effacer » confirme avec le nombre, puis purge et le dit', async () => {
    monter();
    await userEvent.click(await screen.findByRole('button', { name: 'Tout effacer' }));
    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent('Effacer les 28 invitations expirées ?');
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Effacer les 28 invitations' }));
    await waitFor(() => expect(purgeExpiredAgencyInvitations).toHaveBeenCalledWith('jeton'));
    expect(await screen.findByText('28 invitations expirées effacées.')).toBeInTheDocument();
  });

  it('relance sans confirmation l’invitation DÉSIGNÉE', async () => {
    enCours = page([invitation(1), invitation(2, { email: 'deux@exemple.sn' })]);
    monter();
    await userEvent.click(within(await screen.findByTestId('invitation-en-cours-2')).getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(resendInvitation).toHaveBeenCalledWith('jeton', 2));
    expect(await screen.findByText('Invitation renvoyée à deux@exemple.sn.')).toBeInTheDocument();
  });

  it('une invitation expirée se relance encore depuis sa ligne', async () => {
    monter();
    await userEvent.click(await screen.findByRole('button', { name: 'Relancer l’invitation de invite12@exemple.sn' }));
    await waitFor(() => expect(resendInvitation).toHaveBeenCalledWith('jeton', 12));
  });

  it('annuler demande confirmation ; « Conserver » renonce', async () => {
    monter();
    await userEvent.click(within(await screen.findByTestId('invitation-en-cours-1')).getByRole('button', { name: 'Annuler' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Conserver' }));
    expect(revokeInvitation).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByTestId('invitation-en-cours-1')).getByRole('button', { name: 'Annuler' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Annuler l'invitation" }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith('jeton', 1));
  });

  // Vérification de 776dc214f (F4) — l'annulation est irréversible : c'est la ligne touchée qui part,
  // jamais la première de la liste.
  it('annule l’invitation DÉSIGNÉE, et la confirmation la nomme', async () => {
    enCours = page([invitation(1), invitation(2, { email: 'deux@exemple.sn' })]);
    monter();
    await userEvent.click(within(await screen.findByTestId('invitation-en-cours-2')).getByRole('button', { name: 'Annuler' }));
    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent('deux@exemple.sn');
    await userEvent.click(within(dialogue).getByRole('button', { name: "Annuler l'invitation" }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith('jeton', 2));
    expect(revokeInvitation).toHaveBeenCalledTimes(1);
  });

  // Vérification de 776dc214f (F5) — le troisième geste : « Annuler » refusé faute de second facteur
  // passe lui aussi par la garde, puis est rejoué.
  it('« Annuler » refusé faute de second facteur passe par la garde, puis est rejoué', async () => {
    revokeInvitation.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }));
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter({ garde });
    await userEvent.click(within(await screen.findByTestId('invitation-en-cours-1')).getByRole('button', { name: 'Annuler' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: "Annuler l'invitation" }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_required');
  });

  it('les trois gestes passent par la garde du second facteur, puis sont rejoués', async () => {
    const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });
    resendInvitation.mockRejectedValueOnce(refus());
    purgeExpiredAgencyInvitations.mockRejectedValueOnce(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter({ garde });
    await userEvent.click(within(await screen.findByTestId('invitation-en-cours-1')).getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(resendInvitation).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    // Le toast de la relance est lui aussi un `dialog` : la confirmation se désigne par son titre.
    const confirmation = await screen.findByRole('dialog', { name: 'Effacer les 28 invitations expirées ?' });
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Effacer les 28 invitations' }));
    await waitFor(() => expect(purgeExpiredAgencyInvitations).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledTimes(2);
  });

  it('sans la capacité, la liste se lit sans aucun geste', async () => {
    monter({ peutGerer: false });
    await screen.findByTestId('invitation-en-cours-1');
    expect(screen.queryByRole('button', { name: 'Relancer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tout effacer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Relancer l’invitation/ })).toBeNull();
  });

  it('sans invitation : « En cours · 0 », pas de carte des expirées, le formulaire reste', async () => {
    enCours = page([]);
    expirees = page([]);
    monter();
    expect(await screen.findByText('Aucune invitation en cours.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Expirées/ })).toBeNull();
    expect(screen.getByTestId('formulaire')).toBeInTheDocument();
  });

  it('une invitation partie par SMS se nomme par son numéro', async () => {
    enCours = page([invitation(1, { email: null, phone: '+221771234567' })]);
    monter();
    expect(await screen.findByTestId('invitation-en-cours-1')).toHaveTextContent('+221 77 123 45 67');
  });

  it('la lecture en échec se réessaie', async () => {
    fetchPendingAgencyInvitations.mockRejectedValueOnce(new ApiError(500, { message: 'Panne.' }));
    monter();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Réessayer' }))[0]);
    expect(await screen.findByTestId('invitation-en-cours-1')).toBeInTheDocument();
  });

  it('la note dit où se suivent les invitations de locataires', async () => {
    monter({ telephone: true });
    expect(await screen.findByText('Les invitations de locataires se suivent désormais sur la fiche du client, plus ici.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer l’invitation' })).toHaveAttribute('form', 'inviter-un-membre');
  });
});
