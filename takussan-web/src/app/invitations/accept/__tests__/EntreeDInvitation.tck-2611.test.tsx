import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import frMessages from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import type { ApercuDInvitation } from '@/lib/invitation-apercu';

/**
 * TCK-2611 (ADR-0094) — l'invitation valide : qui invite, pour quoi, puis l'entrée par code ; la voie mot
 * de passe repliée ; le compte connecté en un geste. AC2 (aucun POST au rendu, h1 qui nomme l'invitant,
 * l'agence et le rôle) et AC3 (par SMS : numéro → code juste → assistant du bailleur, session ouverte,
 * sans mot de passe) sont éprouvés ici ; la mesure au navigateur est dans la fiche de fidélité.
 */
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...reste }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

const openSession = vi.fn();
const logout = vi.fn();
let utilisateur: Record<string, unknown> | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession, logout, refreshUser: vi.fn(), user: utilisateur }),
}));
vi.mock('@/i18n/hooks', () => ({ useCurrentLocale: () => 'fr' }));
vi.mock('@/lib/auth', () => ({ login: vi.fn(), isTwoFactorChallenge: () => false }));

let drapeau: boolean | null = true;
vi.mock('@/components/bookings/useIdentiteParTelephone', () => ({ useDrapeauConnexionParTelephone: () => drapeau }));

const demanderCode = vi.fn();
const verifierCode = vi.fn();
vi.mock('@/lib/invitation-code', () => ({
  demanderCodeDInvitation: (...a: unknown[]) => demanderCode(...a),
  verifierCodeDInvitation: (...a: unknown[]) => verifierCode(...a),
}));

const accepter = vi.fn();
vi.mock('@/app/actions/invitations', () => ({ accepterInvitationAction: (...a: unknown[]) => accepter(...a) }));

import { EntreeDInvitation } from '../EntreeDInvitation';

const T = frMessages.invitationAccept;

const PAR_SMS: ApercuDInvitation = {
  role: 'owner',
  agence: { nom: 'Dakar Immo', logo: null, ville: 'Dakar', biensPublics: 214, verifiee: true, telephone: '+221338200000' },
  invitant: 'Aïssatou',
  destinataire: { canal: 'phone', masque: '77 ••• 45 67' },
  compteExistant: false,
  expireLe: '2026-11-17T10:00:00+00:00',
  inviteeLe: '2026-11-10T10:00:00+00:00',
  prerempli: { prenom: 'Moussa', nom: 'Ndiaye' },
  attente: { biens: 3, intervention: null },
};
const PAR_EMAIL: ApercuDInvitation = { ...PAR_SMS, destinataire: { canal: 'email', masque: 'm•••@gmail.com' } };

const SESSION = { token: 'jeton-session', user: { id: 9 }, expires_at: '2026-11-20T00:00:00Z', is_new_account: true, invitation: { role: 'owner', invitable_id: 7 } };

let fetchEspion: ReturnType<typeof vi.spyOn>;

function monter(apercu: ApercuDInvitation = PAR_SMS, connecte = false, prerempliDuCompte: { prenom: string; nom: string } | null = null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
        <EntreeDInvitation jeton="jeton-abc" connecte={connecte} apercu={apercu} prerempliDuCompte={prerempliDuCompte} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  drapeau = true;
  utilisateur = null;
  fetchEspion = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('aucun appel réseau attendu'));
  demanderCode.mockResolvedValue({ attente: 60, codeApercu: null });
});

afterEach(() => fetchEspion.mockRestore());

describe('<EntreeDInvitation> — invitation valide, déconnecté', () => {
  it('AC2 — le rendu n’émet aucun POST ; le h1 nomme l’invitant, le rôle et l’agence', () => {
    monter();

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Aïssatou vous invite comme bailleur');
    expect(h1).toHaveTextContent('chez Dakar Immo');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(demanderCode).not.toHaveBeenCalled();
    expect(verifierCode).not.toHaveBeenCalled();
    expect(accepter).not.toHaveBeenCalled();
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('dit ce qui attend, pour qui et jusqu’à quand ; noms préremplis par l’agence, numéro masqué', () => {
    monter();
    expect(screen.getByText('3 biens suivis par l’agence')).toBeInTheDocument();
    expect(screen.getByText('77 ••• 45 67', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/valable jusqu’au 17 nov\./)).toBeInTheDocument();
    expect(screen.getByLabelText(T.firstName)).toHaveValue('Moussa');
    expect(screen.getByLabelText(T.noms.nom)).toHaveValue('Ndiaye');
    expect(screen.getByText('Rempli par Dakar Immo. Corrigez si besoin.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.continuer })).toBeEnabled();
    expect(screen.getByRole('link', { name: T.haveAccount })).toHaveAttribute(
      'href',
      `/auth/login?redirect=${encodeURIComponent('/invitations/accept?token=jeton-abc')}&intention=invitation`,
    );
    // « Vous êtes invité » au masculin seul a disparu, et rien ne promet un brouillon.
    expect(screen.queryByText(/êtes invité/)).not.toBeInTheDocument();
  });

  it('AC3 — par SMS : numéro → code juste → assistant du bailleur, session ouverte, sans mot de passe', async () => {
    verifierCode.mockResolvedValue(SESSION);
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));

    // Par SMS, aucun numéro ne part : le code va au numéro de l'invitation.
    expect(demanderCode).toHaveBeenCalledWith('jeton-abc', null, 'fr');
    expect(await screen.findByRole('heading', { level: 1, name: T.code.titre })).toBeInTheDocument();
    expect(screen.getByText(/Code envoyé au/)).toHaveTextContent('Code envoyé au 77 ••• 45 67');
    expect(screen.queryByRole('button', { name: T.code.modifier })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(T.code.libelle), '123456');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/owner?owner=7'));
    expect(verifierCode).toHaveBeenCalledTimes(1);
    expect(verifierCode).toHaveBeenCalledWith('jeton-abc', { code: '123456', first_name: 'Moussa', last_name: 'Ndiaye' }, 'fr');
    expect(openSession).toHaveBeenCalledWith('jeton-session', { id: 9 }, '2026-11-20T00:00:00Z');
    expect(screen.queryByLabelText(T.password)).not.toBeInTheDocument();
  });

  it('par e-mail : le numéro se saisit, et part à l’envoi comme à la vérification', async () => {
    verifierCode.mockResolvedValue(SESSION);
    const user = userEvent.setup();
    monter(PAR_EMAIL);

    expect(screen.getByRole('button', { name: T.continuer })).toBeDisabled();
    await user.type(screen.getByLabelText(T.numero.libelle), '771234567');
    await user.click(screen.getByRole('button', { name: T.continuer }));

    expect(demanderCode).toHaveBeenCalledWith('jeton-abc', '+221771234567', 'fr');
    await user.type(await screen.findByLabelText(T.code.libelle), '123456');
    await waitFor(() => expect(verifierCode).toHaveBeenCalledWith('jeton-abc', expect.objectContaining({ code: '123456', phone: '+221771234567' }), 'fr'));
  });

  it('hors production, l’encadré de test dit le code (« 482 913 »), en texte seul : rien n’est vérifié pour vous', async () => {
    demanderCode.mockResolvedValue({ attente: 60, codeApercu: '482913' });
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    const encadre = await screen.findByTestId('code-de-preproduction');
    expect(encadre).toHaveTextContent('482 913');
    expect(encadre.querySelector('button')).toBeNull();
    expect(verifierCode).not.toHaveBeenCalled();
  });

  it('second facteur : le même code repart avec le code de l’application', async () => {
    verifierCode.mockResolvedValueOnce({ requires_2fa: true }).mockResolvedValueOnce(SESSION);
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.type(await screen.findByLabelText(T.code.libelle), '123456');
    await user.type(await screen.findByLabelText(T.secondFacteur.libelle), '654321');
    await user.click(screen.getByRole('button', { name: T.secondFacteur.verifier }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/owner?owner=7'));
    expect(verifierCode).toHaveBeenLastCalledWith('jeton-abc', expect.objectContaining({ code: '123456', two_factor_code: '654321' }), 'fr');
  });

  it('conditions d’un compte du Radar : le même code repart avec la version acceptée', async () => {
    verifierCode.mockResolvedValueOnce({ requires_terms: true, terms_version: '2026-10' }).mockResolvedValueOnce(SESSION);
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.type(await screen.findByLabelText(T.code.libelle), '123456');
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: T.conditions.continuer }));

    await waitFor(() => expect(verifierCode).toHaveBeenLastCalledWith('jeton-abc', expect.objectContaining({ code: '123456', terms_version: '2026-10' }), 'fr'));
  });

  it('code faux (422) : on le dit, et l’écran du code reste', async () => {
    verifierCode.mockRejectedValue(new ApiError(422, { code: 'phone_code_invalid' }));
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.type(await screen.findByLabelText(T.code.libelle), '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(T.errors.codeInvalide);
    expect(screen.getByRole('heading', { level: 1, name: T.code.titre })).toBeInTheDocument();
    expect(openSession).not.toHaveBeenCalled();
  });

  it('401 requires_login : le code a servi — retour au numéro, l’adresse masquée et « Me connecter »', async () => {
    verifierCode.mockRejectedValue(new ApiError(401, { code: 'invitation.requires_login', requires_login: true, email: 'm•••@gmail.com' }));
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.type(await screen.findByLabelText(T.code.libelle), '123456');

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Cette invitation a été envoyée à un autre compte (m•••@gmail.com).');
    expect(screen.getByRole('button', { name: T.continuer })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: T.meConnecter })[0]).toHaveAttribute('href', expect.stringContaining('/auth/login?redirect='));
    expect(openSession).not.toHaveBeenCalled();
  });

  it('410 au code : l’invitation s’est fermée entre-temps, la page se relit', async () => {
    verifierCode.mockRejectedValue(new ApiError(410, { code: 'invitation.token_revoked' }));
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.continuer }));
    await user.type(await screen.findByLabelText(T.code.libelle), '123456');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('« Utiliser un mot de passe » : la voie de TCK-626, l’œil compris, noms gardés', async () => {
    accepter.mockResolvedValue({ ok: false, seConnecter: false, message: 'refus' });
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: T.voies.motDePasse }));

    const champ = screen.getByLabelText(T.password);
    expect(champ).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: T.motDePasse.afficher }));
    expect(champ).toHaveAttribute('type', 'text');

    await user.type(champ, 'secret123');
    await user.click(screen.getByRole('button', { name: T.create }));
    expect(accepter).toHaveBeenCalledWith('jeton-abc', { first_name: 'Moussa', last_name: 'Ndiaye', password: 'secret123' });

    await user.click(screen.getByRole('button', { name: T.voies.code }));
    expect(screen.getByRole('button', { name: T.continuer })).toBeInTheDocument();
  });
});

describe('<EntreeDInvitation> — drapeau phone_login', () => {
  it('éteint : la voie mot de passe est ouverte, sans « Continuer avec mon numéro »', () => {
    drapeau = false;
    monter();
    expect(screen.queryByRole('button', { name: T.continuer })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: T.voies.motDePasse })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: T.voies.code })).not.toBeInTheDocument();
    expect(screen.getByLabelText(T.password)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.create })).toBeInTheDocument();
  });

  it('pas encore lu : ni l’une ni l’autre voie', () => {
    drapeau = null;
    monter();
    expect(screen.queryByRole('button', { name: T.continuer })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(T.password)).not.toBeInTheDocument();
  });
});

describe('<EntreeDInvitation> — déjà inscrit', () => {
  beforeEach(() => {
    utilisateur = { id: 4, first_name: 'Moussa', last_name: 'Ndiaye', phone: '+221771234567', email: null };
  });

  it('le compte, « Rejoindre Dakar Immo » en un geste, puis l’assistant du rôle', async () => {
    accepter.mockResolvedValue({ ok: true, invitation: { role: 'owner', invitable_id: 7, email: null, phone: null } });
    const user = userEvent.setup();
    monter(PAR_SMS, true);

    expect(screen.getByText(T.connecte.compte)).toBeInTheDocument();
    expect(screen.getByText('Moussa Ndiaye')).toBeInTheDocument();
    expect(screen.getByText('(77 ••• 45 67)')).toBeInTheDocument();
    expect(accepter).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Rejoindre Dakar Immo' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/owner?owner=7'));
    expect(accepter).toHaveBeenCalledWith('jeton-abc', undefined);
  });

  it('« Ce n’est pas moi » déconnecte, puis la page se relit sans session', async () => {
    logout.mockResolvedValue(undefined);
    const user = userEvent.setup();
    monter(PAR_SMS, true);

    await user.click(screen.getByRole('button', { name: T.connecte.pasMoi }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
  });

  it('connecté sans nom : le nom proposé par l’agence, à confirmer (TCK-2281)', async () => {
    accepter.mockResolvedValue({ ok: true, invitation: { role: 'owner', invitable_id: 7, email: null, phone: null } });
    const user = userEvent.setup();
    monter(PAR_SMS, true, { prenom: 'Awa', nom: 'Sarr' });

    expect(screen.getByText('Votre compte n’a pas encore de nom : Dakar Immo a proposé celui-ci. Confirmez-le ou corrigez-le.')).toBeInTheDocument();
    expect(screen.getByLabelText(T.firstName)).toHaveValue('Awa');
    await user.click(screen.getByRole('button', { name: 'Rejoindre Dakar Immo' }));
    await waitFor(() => expect(accepter).toHaveBeenCalledWith('jeton-abc', { first_name: 'Awa', last_name: 'Sarr' }));
  });

  it('refus 403 (mauvais compte) : le dire, et « Changer de compte »', async () => {
    accepter.mockResolvedValue({ ok: false, seConnecter: false, changerDeCompte: true, message: T.errors.mauvaisCompte });
    logout.mockResolvedValue(undefined);
    const user = userEvent.setup();
    monter(PAR_SMS, true);

    await user.click(screen.getByRole('button', { name: 'Rejoindre Dakar Immo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(T.errors.mauvaisCompte);
    await user.click(screen.getByRole('button', { name: T.connecte.changer }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});
