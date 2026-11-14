import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import type { InterventionDOrigine, ReglagesDuPrestataire } from '@/lib/service-provider-onboarding';

const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const spOnboardCompleteAction = vi.fn();
const spAccepterInterventionAction = vi.fn();
const spPatchTradesAction = vi.fn();
const spPatchAvailabilityAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/service-provider-onboarding', () => ({
  spOnboardCompleteAction: (...args: unknown[]) => spOnboardCompleteAction(...args),
  spAccepterInterventionAction: (...args: unknown[]) => spAccepterInterventionAction(...args),
  spPatchTradesAction: (...args: unknown[]) => spPatchTradesAction(...args),
  spPatchAvailabilityAction: (...args: unknown[]) => spPatchAvailabilityAction(...args),
}));

const refreshUser = vi.fn();
const UTILISATEUR_VERIFIE = {
  first_name: 'Ibrahima',
  phone: '+221775305678' as string | null,
  phone_verified_at: new Date().toISOString() as string | null,
};
let utilisateur = UTILISATEUR_VERIFIE;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: utilisateur, token: 'token', isLoading: false, refreshUser }),
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, prefetch: vi.fn() }),
}));

let brouillon: { step: number; data: Record<string, unknown> } | null = null;
const sauverBrouillon = vi.fn();
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon,
    isLoading: false,
    save: sauverBrouillon,
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
    clear: vi.fn().mockResolvedValue(true),
  }),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: toastAdd }),
}));

import { ServiceProviderOnboardingWizard } from '../ServiceProviderOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
      {node}
    </NextIntlClientProvider>
  );
}

const P = frMessages.onboarding.invite.prestataire;
const NUMERO = frMessages.onboarding.invite.numero;

const INTERVENTION: InterventionDOrigine = {
  id: 501,
  title: 'Fuite sous évier',
  category: 'plumbing',
  place: { quarter: 'Mermoz', city: 'Dakar' },
  photo: { url: 'https://api.test/media/1', thumbnail_url: 'https://api.test/media/1/vignette', count: 3 },
  quote: { amount: 45000, currency: 'XOF' },
};

const REGLAGES_VIDES: ReglagesDuPrestataire = {
  id: 31,
  trades: [],
  intervention_zones: [],
  hourly_rate: null,
  visit_fee: null,
  available_slots: [],
};

function monter(props: Partial<React.ComponentProps<typeof ServiceProviderOnboardingWizard>> = {}) {
  return render(
    withIntl(
      <ServiceProviderOnboardingWizard
        spProfileId={31}
        agence="Dakar Immo"
        intervention={INTERVENTION}
        categorie={frMessages.maintenance.category.plumbing}
        reglages={REGLAGES_VIDES}
        pieces={[{ code: 'insurance', required: false, kind: 'file', state: 'missing' }]}
        {...props}
      />,
    ),
  );
}

/**
 * TCK-2613 — deux écrans : le numéro, puis « Une intervention vous attend » (la demande jointe à l'invitation),
 * « Accepter » ou « Proposer un créneau » (décision du porteur du 2026-11-10, point 11 b), et « Complétez votre
 * profil » qui dit ce qui reste. Plus de métiers, de disponibilités ni d'assurance dans l'assistant.
 */
describe('<ServiceProviderOnboardingWizard> — deux écrans (TCK-2613)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    utilisateur = UTILISATEUR_VERIFIE;
    brouillon = null;
    sessionStorage.clear();
    spOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: { service_provider_profile: { id: 31, status: 'active' }, active_profile_id: 'service_provider:31', redirect_to_maintenance_request_id: 501 },
    });
    spAccepterInterventionAction.mockResolvedValue({ ok: true, data: { id: 501, scheduled_at: null, accepted_at: '2026-11-13T10:00:00Z' } });
  });

  it('numéro vérifié : l’écran 2 d’abord — la carte de l’intervention, sans adresse exacte ; l’ancien assistant n’y est plus', async () => {
    monter();

    expect(await screen.findByRole('heading', { level: 1, name: P.titre })).toBeInTheDocument();
    expect(document.querySelector('[data-etape-d-invite]')).toHaveAttribute('data-etape-d-invite', '2');
    const carte = screen.getByTestId('intervention-501');
    expect(carte).toHaveTextContent('Fuite sous évier');
    expect(carte).toHaveTextContent(`${frMessages.maintenance.category.plumbing} · Mermoz, Dakar`);
    expect(carte).toHaveTextContent(/Devis : 45\s000\sF\sCFA/);
    expect(carte).toHaveTextContent('3 photos');
    expect(carte).toHaveTextContent(P.carte.adresseApres);
    expect(carte).toHaveTextContent('Demande de Dakar Immo');
    expect(within(carte).getByRole('img', { name: P.carte.photo })).toHaveAttribute('src', 'https://api.test/media/1/vignette');
    expect(screen.getByText('Dakar Immo vous a invité pour ce dépannage. Répondez d’abord, complétez votre profil ensuite.')).toBeInTheDocument();
    // Les écrans de l'ancien assistant ne sont plus là : ni métiers à cocher, ni grille, ni téléverseur.
    expect(screen.queryByText(frMessages.serviceProviders.onboarding.steps.trades.title)).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });

  it('« Accepter » finalise PUIS accepte, sans créneau ; l’écran dit « Intervention acceptée » et mène à l’intervention', async () => {
    monter();
    fireEvent.click(await screen.findByRole('button', { name: P.accepter }));

    await waitFor(() => expect(spAccepterInterventionAction).toHaveBeenCalledWith(501, null));
    expect(spOnboardCompleteAction).toHaveBeenCalledWith(31, undefined);
    // L'ordre est imposé par l'API : la demande n'est au prestataire qu'après la fin d'onboarding.
    expect(spOnboardCompleteAction.mock.invocationCallOrder[0]).toBeLessThan(spAccepterInterventionAction.mock.invocationCallOrder[0]);
    const acceptee = await within(screen.getByTestId('intervention-501')).findByRole('status');
    expect(acceptee).toHaveTextContent(P.acceptee.titre);
    expect(acceptee).toHaveTextContent(P.acceptee.sansPassage);
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: P.acceptee.voir }));
    expect(routerPush).toHaveBeenCalledWith('/app/maintenance/501');
    // Une seule fin d'onboarding : la sortie d'après n'a plus rien à écrire.
    expect(spOnboardCompleteAction).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('takussan:arrivee-de-parcours')).toContain('"assistant"');
  });

  it('la page re-rendue par la fin d’onboarding (cookie posé) relit une intervention `null` : l’écran garde sa carte et l’acceptation', async () => {
    const { rerender } = monter();
    fireEvent.click(await screen.findByRole('button', { name: P.accepter }));
    await waitFor(() => expect(spAccepterInterventionAction).toHaveBeenCalled());
    // Ce que rend la page re-rendue : le lien consommé, plus d'intervention d'origine.
    rerender(
      withIntl(<ServiceProviderOnboardingWizard spProfileId={31} agence="Dakar Immo" intervention={null} reglages={REGLAGES_VIDES} pieces={null} />),
    );
    expect(await within(screen.getByTestId('intervention-501')).findByRole('status')).toHaveTextContent(P.acceptee.titre);
    expect(screen.getByTestId('intervention-501')).toHaveTextContent(frMessages.maintenance.category.plumbing);
    expect(screen.getByRole('button', { name: P.acceptee.voir })).toBeInTheDocument();
  });

  it('ordre des gestes (fiche, écart ouvert) : au bureau le geste principal d’abord, au téléphone à droite — la tabulation suit le bureau', async () => {
    monter();
    const accepter = await screen.findByRole('button', { name: P.accepter });
    const proposer = screen.getByRole('button', { name: P.proposer });
    // Ordre du DOM = ordre du bureau (maquette a-2-bureau-1280 : « Accepter » puis « Proposer un créneau »).
    expect(accepter.compareDocumentPosition(proposer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Au téléphone, « Accepter » passe à droite (a-2-telephone) ; l’ordre revient dès lg.
    expect(accepter.className).toMatch(/(^|\s)order-last(\s|$)/);
    expect(accepter.className).toMatch(/(^|\s)lg:order-none(\s|$)/);
    expect(proposer.className).not.toMatch(/(^|\s)(lg:)?order-/);

    fireEvent.click(proposer);
    const envoyer = screen.getByRole('button', { name: P.creneau.envoyer });
    const annuler = screen.getByRole('button', { name: P.creneau.annuler });
    expect(envoyer.compareDocumentPosition(annuler) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(envoyer.className).toMatch(/(^|\s)order-last(\s|$)/);
    expect(envoyer.className).toMatch(/(^|\s)lg:order-none(\s|$)/);
  });

  it('« Proposer un créneau » envoie `scheduled_at` à l’heure de Dakar, et l’écran dit la date de passage', async () => {
    spAccepterInterventionAction.mockResolvedValue({
      ok: true,
      data: { id: 501, scheduled_at: '2027-01-15T10:00:00Z', accepted_at: '2026-11-13T10:00:00Z' },
    });
    monter();
    fireEvent.click(await screen.findByRole('button', { name: P.proposer }));
    const champ = screen.getByLabelText(P.creneau.libelle);
    expect(champ).toHaveAttribute('type', 'datetime-local');
    expect(champ.getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    // Vide : rien ne part, la consigne s'écrit sous le champ.
    fireEvent.click(screen.getByRole('button', { name: P.creneau.envoyer }));
    expect(await screen.findByRole('alert')).toHaveTextContent(P.creneau.requis);
    expect(spOnboardCompleteAction).not.toHaveBeenCalled();

    fireEvent.change(champ, { target: { value: '2027-01-15T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: P.creneau.envoyer }));
    await waitFor(() => expect(spAccepterInterventionAction).toHaveBeenCalledWith(501, '2027-01-15T10:00:00Z'));
    expect(await within(screen.getByTestId('intervention-501')).findByRole('status')).toHaveTextContent(
      'Passage prévu le vendredi 15 janvier 2027',
    );
  });

  it('un créneau refusé (422) s’écrit SOUS le champ ; la fin d’onboarding ne se rejoue pas au second envoi', async () => {
    spAccepterInterventionAction.mockResolvedValueOnce({
      ok: false,
      status: 422,
      message: 'Données invalides.',
      errors: { scheduled_at: ['Le passage doit être dans les 60 prochains jours.'] },
    });
    monter();
    fireEvent.click(await screen.findByRole('button', { name: P.proposer }));
    const champ = screen.getByLabelText(P.creneau.libelle);
    fireEvent.change(champ, { target: { value: '2027-06-15T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: P.creneau.envoyer }));

    const erreur = await screen.findByRole('alert');
    expect(erreur).toHaveTextContent('Le passage doit être dans les 60 prochains jours.');
    expect(erreur).toHaveAttribute('data-erreur-du-creneau');
    expect(champ).toHaveAttribute('aria-invalid', 'true');
    expect(champ.getAttribute('aria-describedby')).toBe(erreur.id);
    expect(screen.queryByText(P.acceptee.titre)).toBeNull();

    fireEvent.change(champ, { target: { value: '2027-01-15T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: P.creneau.envoyer }));
    await waitFor(() => expect(spAccepterInterventionAction).toHaveBeenCalledTimes(2));
    expect(spOnboardCompleteAction).toHaveBeenCalledTimes(1);
  });

  it('un échec de la fin d’onboarding se dit et n’accepte rien', async () => {
    spOnboardCompleteAction.mockResolvedValue({ ok: false, message: 'Profil introuvable.' });
    monter();
    fireEvent.click(await screen.findByRole('button', { name: P.accepter }));
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', description: 'Profil introuvable.' })));
    expect(spAccepterInterventionAction).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('« Plus tard » finalise et mène à /app ; une ligne du profil finalise et mène à son réglage', async () => {
    const { unmount } = monter();
    fireEvent.click(await screen.findByRole('button', { name: P.plusTard }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app'));
    expect(spOnboardCompleteAction).toHaveBeenCalledWith(31, undefined);
    expect(spAccepterInterventionAction).not.toHaveBeenCalled();
    unmount();

    routerPush.mockClear();
    monter();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(P.profil.assurance.nom) }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app/pieces'));
  });

  it('« Complétez votre profil » dit ce qui reste, depuis le profil et les pièces : n sur 5, l’assurance facultative', async () => {
    monter({
      reglages: {
        id: 31,
        trades: ['plumbing', 'electrical'],
        intervention_zones: ['Mermoz', 'Ouakam'],
        hourly_rate: '5000.00',
        visit_fee: 3000,
        available_slots: [],
      },
      pieces: [{ code: 'insurance', required: false, kind: 'file', state: 'missing' }],
    });
    const liste = await screen.findByTestId('profil-a-completer');
    expect(within(liste).getByRole('heading', { level: 2 })).toHaveTextContent(P.profil.titre);
    expect(liste).toHaveTextContent('3 sur 5');
    expect(liste.querySelector('[data-ligne-du-profil=zones]')).toHaveTextContent('Mermoz, Ouakam');
    expect(liste.querySelector('[data-ligne-du-profil=tarifs]')).toHaveTextContent(/5\s000\sF\sCFA de l’heure · visite 3\s000\sF\sCFA/);
    expect(liste.querySelector('[data-ligne-du-profil=disponibilites]')).toHaveTextContent(P.profil.disponibilites.vide);
    expect(liste.querySelector('[data-ligne-du-profil=assurance]')).toHaveTextContent(P.profil.assurance.vide);
    expect(within(liste).getAllByText(P.profil.fait)).toHaveLength(3);
  });

  it('sans intervention jointe : « Bienvenue chez {agence} », la liste, et « Aller à mon espace »', async () => {
    monter({ intervention: null, reglages: null, pieces: null });
    expect(await screen.findByRole('heading', { level: 1, name: 'Bienvenue chez Dakar Immo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: P.accepter })).toBeNull();
    // Réglages illisibles : rien n'est coché, rien n'est inventé.
    expect(screen.getByTestId('profil-a-completer')).toHaveTextContent('0 sur 5');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${P.allerAMonEspace}`) }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app'));
  });

  it('un brouillon de l’assistant à quatre écrans reprend à l’écran 2 ; ses métiers et sa grille sont ignorés', async () => {
    brouillon = {
      step: 3,
      data: {
        phone: { number: '+221775305678', code: '123456', verified: true },
        trades: { list: ['plumbing'], intervention_zones: ['Yoff'], hourly_rate: '1', visit_fee: '1' },
        availability: { mon: ['morning'] },
      },
    };
    monter();
    expect(await screen.findByRole('heading', { level: 1, name: P.titre })).toBeInTheDocument();
    expect(screen.queryByText('Yoff')).toBeNull();
    expect(spPatchTradesAction).not.toHaveBeenCalled();
  });

  it('numéro non vérifié : l’écran 1 d’abord ; le code accepté ouvre l’écran 2, et ne va jamais au brouillon', async () => {
    utilisateur = { first_name: 'Ibrahima', phone: '+221775305678', phone_verified_at: null };
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    phoneVerifyOtpAction.mockResolvedValue({ ok: true, data: null });
    monter();

    expect(await screen.findByRole('heading', { level: 1, name: NUMERO.titre })).toBeInTheDocument();
    expect(document.querySelector('[data-etape-d-invite]')).toHaveAttribute('data-etape-d-invite', '1');

    fireEvent.click(screen.getByRole('button', { name: NUMERO.recevoir }));
    fireEvent.change(await screen.findByLabelText(NUMERO.codeLibelle), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: NUMERO.continuer }));

    expect(await screen.findByRole('heading', { level: 1, name: P.titre })).toBeInTheDocument();
    expect(screen.getByText(/Numéro vérifié/)).toHaveTextContent('77 •• •• 56 78');
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221775305678');
    expect(JSON.stringify(sauverBrouillon.mock.calls)).not.toContain('482913');
  });
});
