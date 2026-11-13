import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const agentUpdateSpecializationAction = vi.fn();
const agentOnboardCompleteAction = vi.fn();
const getAgentFirstLeadAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/agent-onboarding', () => ({
  agentSubmitKycAction: vi.fn(),
  agentUpdateSpecializationAction: (...args: unknown[]) => agentUpdateSpecializationAction(...args),
  agentOnboardCompleteAction: (...args: unknown[]) => agentOnboardCompleteAction(...args),
  getAgentFirstLeadAction: (...args: unknown[]) => getAgentFirstLeadAction(...args),
}));

const useAgentRoleCapabilities = vi.fn();
vi.mock('@/hooks/useCan', () => ({
  useAgentRoleCapabilities: (...args: unknown[]) => useAgentRoleCapabilities(...args),
}));

const refreshUser = vi.fn();
const UTILISATEUR_VERIFIE = {
  first_name: 'Fatou',
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

import { AgentOnboardingWizard } from '../AgentOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">
      {node}
    </NextIntlClientProvider>
  );
}

const AGENT = frMessages.onboarding.invite.agent;
const NUMERO = frMessages.onboarding.invite.numero;

const PROSPECT = {
  id: 42,
  first_name: 'Mamadou',
  last_name: 'Sarr',
  full_name: 'Mamadou Sarr',
  email: null,
  phone: '+221775302148',
  pipeline_stage: 'prospect',
};

function piece(code: string, state = 'missing') {
  return { code, required: true, kind: 'file', state };
}

/**
 * TCK-2613 — deux écrans : le numéro, puis « Bienvenue dans l’équipe, {prénom} » et le premier prospect confié.
 * Plus de pièces ni de récapitulatif dans l’assistant ; chaque sortie de l’écran 2 finalise (`complete`) avant de
 * naviguer ; les zones s’enregistrent sans jamais toucher au numéro de carte.
 */
describe('<AgentOnboardingWizard> — deux écrans (TCK-2613)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    utilisateur = UTILISATEUR_VERIFIE;
    brouillon = null;
    sessionStorage.clear();
    agentOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: { agent_profile: { id: 11, status: 'active' }, active_profile_id: 'agent:11' },
    });
    getAgentFirstLeadAction.mockResolvedValue({ ok: true, data: { customer: PROSPECT } });
    useAgentRoleCapabilities.mockReturnValue({
      data: { data: { agency_id: 3, capabilities: ['properties.create'] } },
      isLoading: false,
      isError: false,
    });
  });

  it('AC1 — numéro vérifié : l’écran 2 d’abord, le prospect en tête ; « Aller à mon espace » finalise et mène à /app', async () => {
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" specialite="residential" />));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bienvenue dans l’équipe, Fatou' })).toBeInTheDocument();
    expect(document.querySelector('[data-etape-d-invite]')).toHaveAttribute('data-etape-d-invite', '2');
    const carte = await screen.findByTestId('agent-first-lead-42');
    expect(getAgentFirstLeadAction).toHaveBeenCalledWith(11);
    expect(carte).toHaveTextContent('Mamadou Sarr');
    expect(carte).toHaveTextContent('+221 77 530 21 48');
    expect(carte).toHaveTextContent(AGENT.etapes.prospect);
    expect(within(carte).getByRole('link', { name: AGENT.prospect.appeler })).toHaveAttribute('href', 'tel:+221775302148');
    expect(within(carte).getByRole('link', { name: AGENT.prospect.whatsapp })).toHaveAttribute('href', 'https://wa.me/221775302148');
    expect(screen.getByText('Dakar Immo vous a déjà confié un prospect. Il attend votre appel.')).toBeInTheDocument();
    // Plus d'écran de pièces : ni numéro de carte, ni « Soumettre le dossier ».
    expect(screen.queryByText(frMessages.agents.onboarding.steps.kyc.submitCta)).toBeNull();
    expect(screen.queryByLabelText(frMessages.agents.onboarding.steps.kyc.licenseNumberLabel)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: AGENT.allerAMonEspace }));
    await waitFor(() => expect(agentOnboardCompleteAction).toHaveBeenCalledWith(11, undefined));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app'));
    expect(sessionStorage.getItem('takussan:arrivee-de-parcours')).toContain('"assistant"');
  });

  it('« Voir la fiche » finalise puis ouvre la fiche du prospect', async () => {
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));
    await screen.findByTestId('agent-first-lead-42');

    fireEvent.click(screen.getAllByRole('button', { name: AGENT.prospect.voirLaFiche })[0]!);
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app/customers/42'));
    expect(agentOnboardCompleteAction).toHaveBeenCalledTimes(1);
  });

  it('aucun prospect confié : « Pas encore de prospect pour vous » et « Voir les demandes », qui finalise', async () => {
    getAgentFirstLeadAction.mockResolvedValue({ ok: true, data: { customer: null } });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));

    const vide = await screen.findByTestId('agent-sans-prospect');
    expect(vide).toHaveTextContent(AGENT.sansProspect.titre);
    fireEvent.click(within(vide).getByRole('button', { name: AGENT.sansProspect.demandes }));
    await waitFor(() => expect(agentOnboardCompleteAction).toHaveBeenCalledWith(11, undefined));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/app/leads'));
  });

  it('une lecture du prospect en échec se dit, et ne prétend pas qu’il n’y en a pas', async () => {
    getAgentFirstLeadAction.mockResolvedValue({ ok: false, message: 'Erreur serveur.' });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));

    expect(await screen.findByRole('alert')).toHaveTextContent(AGENT.prospect.erreur);
    expect(screen.queryByText(AGENT.sansProspect.titre)).toBeNull();
  });

  it('les zones s’enregistrent d’un geste, SANS `license_number` : le numéro de carte n’est jamais effacé (TCK-1779)', async () => {
    agentUpdateSpecializationAction.mockResolvedValue({
      ok: true,
      data: { id: 11, specialization: 'residential', intervention_zones: ['Mermoz'], license_number: 'AGT-1' },
    });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" specialite="residential" />));
    await screen.findByTestId('agent-first-lead-42');
    expect(screen.getByText(AGENT.zones.aucune)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: AGENT.zones.modifier }));
    const champ = screen.getByLabelText(frMessages.agents.onboarding.steps.specialization.zonesLabel);
    fireEvent.change(champ, { target: { value: 'Mermoz' } });
    fireEvent.keyDown(champ, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: AGENT.zones.enregistrer }));

    await waitFor(() => expect(agentUpdateSpecializationAction).toHaveBeenCalledTimes(1));
    const [id, corps] = agentUpdateSpecializationAction.mock.calls[0] as [number, Record<string, unknown>];
    expect(id).toBe(11);
    expect(corps).toEqual({ specialization: 'residential', intervention_zones: ['Mermoz'] });
    expect('license_number' in corps).toBe(false);

    expect(await screen.findByText(AGENT.zones.enregistre)).toBeInTheDocument();
    expect(screen.getByText(AGENT.zones.texte)).toBeInTheDocument();
    // Le brouillon garde ce que l'API a enregistré.
    await waitFor(() => {
      const dernier = sauverBrouillon.mock.calls.at(-1) as [number, { specialization?: { zones: string[]; saved: boolean } }];
      expect(dernier[1].specialization).toEqual({ value: 'residential', zones: ['Mermoz'], saved: true });
    });
  });

  it('sans spécialisation, « Enregistrer » le dit sous le bloc et n’envoie rien', async () => {
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));
    await screen.findByTestId('agent-first-lead-42');

    fireEvent.click(screen.getByRole('button', { name: AGENT.zones.modifier }));
    fireEvent.click(screen.getByRole('button', { name: AGENT.zones.enregistrer }));
    expect(await screen.findByText(AGENT.zones.specialisationRequise)).toBeInTheDocument();
    expect(agentUpdateSpecializationAction).not.toHaveBeenCalled();
  });

  it('un échec d’enregistrement des zones se dit sous le bloc, et garde la saisie ouverte', async () => {
    agentUpdateSpecializationAction.mockResolvedValue({ ok: false, message: 'Zone invalide.' });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" specialite="luxury" />));
    await screen.findByTestId('agent-first-lead-42');

    fireEvent.click(screen.getByRole('button', { name: AGENT.zones.modifier }));
    fireEvent.click(screen.getByRole('button', { name: AGENT.zones.enregistrer }));
    const alertes = await screen.findAllByRole('alert');
    expect(alertes.some((a) => a.textContent === 'Zone invalide.')).toBe(true);
    expect(screen.getByRole('button', { name: AGENT.zones.enregistrer })).toBeInTheDocument();
  });

  it('les droits sont ceux du RÔLE de ce profil, repliés au téléphone', async () => {
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));
    const droits = await screen.findByTestId('agent-capabilities');
    expect(useAgentRoleCapabilities).toHaveBeenCalledWith(11);
    const bascule = within(droits).getByRole('button', { name: /Ce que vous pouvez faire dans l’agence/ });
    expect(bascule).toHaveAttribute('aria-expanded', 'false');
    expect(bascule).toHaveTextContent('1 droit donné par l’agence');
    fireEvent.click(bascule);
    expect(bascule).toHaveAttribute('aria-expanded', 'true');
    expect(within(droits).getByText('Créer un bien')).toBeVisible();
  });

  it('le rappel ne nomme que les pièces qui restent ; toutes envoyées, aucun rappel', async () => {
    const { unmount } = render(
      withIntl(
        <AgentOnboardingWizard
          agentProfileId={11}
          agence="Dakar Immo"
          pieces={[piece('license'), piece('cni', 'sent'), piece('photo')] as never}
        />,
      ),
    );
    const rappel = await screen.findByTestId('rappel-des-pieces');
    expect(rappel).toHaveTextContent('Il vous reste 2 pièces à ajouter : votre carte professionnelle et votre photo de profil.');
    unmount();

    render(
      withIntl(
        <AgentOnboardingWizard
          agentProfileId={11}
          agence="Dakar Immo"
          pieces={[piece('license', 'sent'), piece('cni', 'verified'), piece('photo', 'sent')] as never}
        />,
      ),
    );
    await screen.findByTestId('agent-first-lead-42');
    expect(screen.queryByTestId('rappel-des-pieces')).toBeNull();
  });

  it('un échec de la fin de l’onboarding se dit et ne navigue pas', async () => {
    agentOnboardCompleteAction.mockResolvedValue({ ok: false, message: 'Profil introuvable.' });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));
    fireEvent.click(await screen.findByRole('button', { name: AGENT.allerAMonEspace }));
    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', description: 'Profil introuvable.' })));
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('un brouillon de l’assistant à quatre écrans reprend à l’écran 2, avec ses zones ENREGISTRÉES seulement', async () => {
    brouillon = {
      step: 3,
      data: {
        phone: { number: '+221775305678', code: '', verified: true },
        kyc: { license_number: 'AGT-1', cni_uploaded: true },
        specialization: { value: 'commercial', zones: ['Ngor'], saved: true },
      },
    };
    const { unmount } = render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));
    expect(await screen.findByRole('heading', { level: 1, name: 'Bienvenue dans l’équipe, Fatou' })).toBeInTheDocument();
    expect(screen.getByText('Ngor')).toBeInTheDocument();
    expect(screen.getByText(frMessages.agents.onboarding.steps.specialization.specializationValues.commercial)).toBeInTheDocument();
    unmount();

    brouillon = {
      step: 2,
      data: { phone: { number: '+221775305678', code: '', verified: true }, specialization: { value: 'luxury', zones: ['Yoff'], saved: false } },
    };
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" specialite="residential" />));
    await screen.findByTestId('agent-first-lead-42');
    expect(screen.queryByText('Yoff')).toBeNull();
    expect(screen.getByText(frMessages.agents.onboarding.steps.specialization.specializationValues.residential)).toBeInTheDocument();
  });

  it('numéro non vérifié : l’écran 1 d’abord ; le code accepté ouvre l’écran 2, et ne va jamais au brouillon', async () => {
    utilisateur = { first_name: 'Fatou', phone: '+221775305678', phone_verified_at: null };
    phoneSendOtpAction.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
    phoneVerifyOtpAction.mockResolvedValue({ ok: true, data: null });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} agence="Dakar Immo" />));

    expect(await screen.findByRole('heading', { level: 1, name: NUMERO.titre })).toBeInTheDocument();
    expect(document.querySelector('[data-etape-d-invite]')).toHaveAttribute('data-etape-d-invite', '1');
    expect(getAgentFirstLeadAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: NUMERO.recevoir }));
    fireEvent.change(await screen.findByLabelText(NUMERO.codeLibelle), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: NUMERO.continuer }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Bienvenue dans l’équipe, Fatou' })).toBeInTheDocument();
    expect(screen.getByText(/Numéro vérifié/)).toHaveTextContent('77 •• •• 56 78');
    expect(phoneSendOtpAction).toHaveBeenCalledWith('+221775305678');
    expect(JSON.stringify(sauverBrouillon.mock.calls)).not.toContain('482913');
  });
});
