import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock all server actions before importing the component.
const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const ownerOnboardCompleteAction = vi.fn();
const getOwnerPropertiesAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/owner-onboarding', () => ({
  ownerOnboardCompleteAction: (...args: unknown[]) => ownerOnboardCompleteAction(...args),
  getOwnerPropertiesAction: (...args: unknown[]) => getOwnerPropertiesAction(...args),
}));

const refreshUser = vi.fn();
// TCK-566 — mutable : le cas « aucun numéro enregistré » en a besoin.
const UTILISATEUR_VERIFIE = {
  phone: '+221770000000' as string | null,
  phone_verified_at: new Date().toISOString() as string | null,
};
let utilisateur = UTILISATEUR_VERIFIE;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: utilisateur,
    token: 'token',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, prefetch: vi.fn() }),
}));

// `useWizardDraft` autosaves drafts via fetch — short-circuit it so the
// wizard hydrates with empty state and we can step through synchronously.
// TCK-566 — piloté par test : le brouillon RELU est le sujet du dernier cas.
let brouillon: { step: number; data: Record<string, unknown> } | null = null;
// TCK-1362 — espion stable : le corps écrit dans le brouillon est le sujet d'un cas.
const sauverBrouillon = vi.fn();
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon,
    isLoading: false,
    save: sauverBrouillon,
    // TCK-475 — cette doublure rendait `undefined`, et c'était FAUX depuis
    // TCK-465 : `flush()` rend un `ResultatEcritureBrouillon`, plus
    // `Promise<void>`. `undefined` ne simule pas le silence d'avant — c'est une
    // valeur qu'aucun appelant ne sait lire, et elle est restée verte tant que
    // personne ne lisait. Le jour où `WizardReprenable` s'est mis à consulter ce
    // résultat, les trois assistants d'onboarding sont tombés en TypeError.
    // `{ ok: true, ecrit: false }` est ce que la production rend au repos : rien
    // en attente, aucun échec antérieur (`useWizardDraft.ts`, `flush()`).
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
    clear: vi.fn().mockResolvedValue(true),
  }),
}));

// Toast addition is invoked from inside the wizard — stub the provider
// so we can assert on calls without rendering the actual portal.
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/toast')>();
  return {
    ...actual,
    useToast: () => ({ add: toastAdd }),
  };
});

import { OwnerOnboardingWizard } from '../OwnerOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

const BIENS = [
  { id: 11, title: 'Appartement F4', status: 'rented', contract_type: 'rent', rent_period: 'monthly', price: 350000, location: { quarter: 'Mermoz' } },
  { id: 12, title: 'Studio', status: 'available', contract_type: 'rent', rent_period: 'monthly', price: 150000, location: { quarter: 'Ouakam' } },
];

const INVITE = frMessages.onboarding.invite;

function piece(code: string, required: boolean, state = 'missing') {
  return { code, required, kind: code === 'ninea' ? 'file_and_number' : 'file', state };
}

/**
 * TCK-2613 — deux écrans : le numéro, puis « Vos biens chez {agence} ». Plus de pièces ni de visite guidée dans
 * l'assistant ; chaque sortie de l'écran 2 finalise (`complete`) avant de naviguer.
 */
describe('<OwnerOnboardingWizard> — deux écrans (TCK-2613)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    utilisateur = UTILISATEUR_VERIFIE;
    brouillon = null;
    sessionStorage.clear();
    ownerOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: { owner_profile: { id: 7, status: 'active' }, active_profile_id: 'owner:7', properties_count: 2 },
    });
    getOwnerPropertiesAction.mockResolvedValue({
      ok: true,
      data: { data: BIENS, meta: { total: 5, current_page: 1, last_page: 2, per_page: 3 } },
    });
  });

  it('AC1 — numéro vérifié : l’écran 2 d’abord (« Étape 2 sur 2 »), « Aller à mon espace » finalise et mène à /app', async () => {
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));

    expect(await screen.findByRole('heading', { level: 1, name: 'Vos biens chez Dakar Immo' })).toBeInTheDocument();
    expect(document.querySelector('[data-etape-d-invite]')).toHaveAttribute('data-etape-d-invite', '2');
    expect(await screen.findByText('L’agence suit déjà 5 biens pour vous. Voici où ils en sont aujourd’hui.')).toBeInTheDocument();
    expect(getOwnerPropertiesAction).toHaveBeenCalledWith(7);
    // Plus d'écran de pièces ni de visite guidée.
    // TCK-2821 : les textes de l'étape ont quitté le dictionnaire, l'absence s'affirme en clair, champ fichier compris.
    expect(screen.queryByText(/Envoyer mes pièces/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(frMessages.owners.onboarding.steps.tour.skip)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: INVITE.bailleur.allerAMonEspace }));
    await waitFor(() => expect(ownerOnboardCompleteAction).toHaveBeenCalledWith(7, undefined));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app'));
    // TCK-2615 — l'arrivée est marquée : la coque n'ouvrira aucune fenêtre de bienvenue.
    expect(sessionStorage.getItem('takussan:arrivee-de-parcours')).toContain('"assistant"');
  });

  it('une ligne de bien, « Voir tous mes biens » et « Proposer un bien » finalisent puis mènent où on a cliqué', async () => {
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));
    const ligne = await screen.findByTestId('owner-property-11');
    expect(ligne).toHaveTextContent('Appartement F4 · Mermoz');
    expect(ligne).toHaveTextContent('Loué');

    fireEvent.click(screen.getByRole('button', { name: INVITE.bailleur.proposer.action }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app/properties/new'));
    expect(ownerOnboardCompleteAction).toHaveBeenCalledTimes(1);
  });

  it('« Voir tous mes biens » mène à la liste, après la fin de l’onboarding', async () => {
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));
    fireEvent.click(await screen.findByRole('button', { name: INVITE.bailleur.voirTous }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app/properties'));
    expect(ownerOnboardCompleteAction).toHaveBeenCalledWith(7, undefined);
  });

  it('sans bien rattaché : « Proposer mon premier bien » en bouton plein ouvre l’assistant en proposition', async () => {
    getOwnerPropertiesAction.mockResolvedValue({ ok: true, data: { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 3 } } });
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));

    expect(await screen.findByText(INVITE.bailleur.vide.titre)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: INVITE.bailleur.vide.action }));
    await waitFor(() => expect(ownerOnboardCompleteAction).toHaveBeenCalledWith(7, undefined));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app/properties/new'));
  });

  it('un échec de la fin de l’onboarding se dit et ne navigue pas', async () => {
    ownerOnboardCompleteAction.mockResolvedValue({ ok: false, message: 'Profil introuvable.' });
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));
    fireEvent.click(await screen.findByRole('button', { name: INVITE.bailleur.allerAMonEspace }));
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', description: 'Profil introuvable.' })));
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('numéro non vérifié : l’écran 1 d’abord, et le code accepté ouvre l’écran 2', async () => {
    utilisateur = { phone: '+221776124567', phone_verified_at: null };
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    phoneVerifyOtpAction.mockResolvedValue({ ok: true, data: null });
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));

    expect(await screen.findByRole('heading', { level: 1, name: INVITE.numero.titre })).toBeInTheDocument();
    expect(document.querySelector('[data-etape-d-invite]')).toHaveAttribute('data-etape-d-invite', '1');
    expect(getOwnerPropertiesAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: INVITE.numero.recevoir }));
    fireEvent.change(await screen.findByLabelText(INVITE.numero.codeLibelle), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: INVITE.numero.continuer }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Vos biens chez Dakar Immo' })).toBeInTheDocument();
    expect(screen.getByText(/Numéro vérifié/)).toHaveTextContent('77 •• •• 45 67');
  });

  it('un brouillon de l’assistant à quatre écrans (étape 3, `kyc`, `tour`) reprend à l’écran 2', async () => {
    brouillon = {
      step: 3,
      data: { phone: { number: '+221770000000', code: '', verified: true }, kyc: { cni_uploaded: true }, tour: { finished: true } },
    };
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" />));
    expect(await screen.findByRole('heading', { level: 1, name: 'Vos biens chez Dakar Immo' })).toBeInTheDocument();
  });

  it('TCK-2614 (2b) — particulier : le rappel nomme le RIB et la pièce d’identité, pas le NINEA facultatif', async () => {
    render(
      withIntl(
        <OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" pieces={[piece('cni', true), piece('rib', true), piece('ninea', false)] as never} />,
      ),
    );
    const rappel = await screen.findByTestId('rappel-des-pieces');
    expect(rappel).toHaveTextContent('Pour être payé, il reste 2 pièces à envoyer : votre RIB et votre pièce d’identité.');
    expect(rappel).not.toHaveTextContent('NINEA');
  });

  it('TCK-2614 (2b) — société : le NINEA requis entre dans le rappel ; une pièce envoyée n’y est plus', async () => {
    render(
      withIntl(
        <OwnerOnboardingWizard
          ownerProfileId={7}
          agence="Dakar Immo"
          pieces={[piece('cni', true, 'sent'), piece('rib', true), piece('ninea', true)] as never}
        />,
      ),
    );
    const rappel = await screen.findByTestId('rappel-des-pieces');
    expect(rappel).toHaveTextContent('il reste 2 pièces à envoyer : votre RIB et votre NINEA.');
  });

  it('toutes les pièces envoyées : aucun rappel', async () => {
    render(
      withIntl(
        <OwnerOnboardingWizard ownerProfileId={7} agence="Dakar Immo" pieces={[piece('cni', true, 'sent'), piece('rib', true, 'verified')] as never} />,
      ),
    );
    await screen.findByTestId('owner-property-11');
    expect(screen.queryByTestId('rappel-des-pieces')).toBeNull();
  });
});

/**
 * TCK-566 — le numéro TAPÉ part avec la demande ; un brouillon hérité est remis en E.164. TCK-2613 : le numéro que
 * l'agence a saisi se montre figé avec « Modifier » ; sans numéro, le champ s'ouvre.
 */
describe('<OwnerOnboardingWizard> — saisie du téléphone (TCK-566)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    utilisateur = { phone: null, phone_verified_at: null };
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
  });

  afterEach(() => {
    utilisateur = UTILISATEUR_VERIFIE;
    brouillon = null;
  });

  // TCK-1362 (P84.03) — le code est HACHÉ et à usage unique côté API ; le brouillon serveur, gardé
  // jusqu'à 90 jours, n'en garde jamais la copie en clair.
  it('le code vérifié ne va jamais dans le brouillon serveur', async () => {
    phoneVerifyOtpAction.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} />));

    await user.type(await screen.findByLabelText(INVITE.numero.libelle), '770000000', {
      initialSelectionStart: 0,
      initialSelectionEnd: 0,
    });
    await user.click(screen.getByRole('button', { name: INVITE.numero.recevoir }));
    await user.type(await screen.findByLabelText(INVITE.numero.codeLibelle), '123456');
    await user.click(screen.getByRole('button', { name: INVITE.numero.continuer }));

    await waitFor(() => expect(phoneVerifyOtpAction).toHaveBeenCalledWith('123456'));
    await waitFor(() => {
      const dernier = sauverBrouillon.mock.calls.at(-1) as [number, Record<string, { verified?: boolean }>];
      expect(dernier[1].phone?.verified).toBe(true);
    });
    expect(JSON.stringify(sauverBrouillon.mock.calls)).not.toContain('123456');
  });

  it('envoie le code au numéro TAPÉ, indicatif en tête', async () => {
    const user = userEvent.setup();
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} />));

    const champ = await screen.findByLabelText(INVITE.numero.libelle);
    await user.type(champ, '770000000', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(champ).toHaveValue('770000000');

    await user.click(screen.getByRole('button', { name: INVITE.numero.recevoir }));
    await waitFor(() => expect(phoneSendOtpAction).toHaveBeenCalledTimes(1));
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221770000000');
  });

  it('un numéro NON VIDE mais incomplet ne part pas : le bouton d’envoi reste inactif', async () => {
    const user = userEvent.setup();
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} />));

    const champ = await screen.findByLabelText(INVITE.numero.libelle);
    await user.type(champ, '7700000');
    const envoyer = screen.getByRole('button', { name: INVITE.numero.recevoir });
    expect(envoyer).toBeDisabled();

    await user.click(envoyer);
    expect(phoneSendOtpAction).not.toHaveBeenCalled();

    await user.type(champ, '00');
    expect(envoyer).toBeEnabled();
  });

  it('un numéro relu d’un brouillon hérité, sans indicatif, est remis en E.164 et part', async () => {
    brouillon = { step: 0, data: { phone: { number: '771234567', code: null, verified: false } } };
    const user = userEvent.setup();
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} />));

    expect(await screen.findByText('77 123 45 67')).toBeInTheDocument();
    const envoyer = screen.getByRole('button', { name: INVITE.numero.recevoir });
    expect(envoyer).toBeEnabled();

    await user.click(envoyer);
    await waitFor(() => expect(phoneSendOtpAction).toHaveBeenCalledTimes(1));
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221771234567');
  });

  it('un téléphone null dans un brouillon hérité n’efface pas le numéro du compte', async () => {
    utilisateur = { phone: '+221770000000', phone_verified_at: null };
    brouillon = { step: 0, data: { phone: { number: null, code: null, verified: false } } };
    render(withIntl(<OwnerOnboardingWizard ownerProfileId={7} />));

    expect(await screen.findByText('77 000 00 00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: INVITE.numero.recevoir })).toBeEnabled();
  });
});
