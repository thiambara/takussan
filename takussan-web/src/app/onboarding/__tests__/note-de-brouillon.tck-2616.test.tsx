import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';

/**
 * TCK-2616, AC3 — la note « Vos réponses sont enregistrées au fur et à mesure » ne reste que là
 * où un brouillon est RÉELLEMENT enregistré (les quatre assistants montés sur `WizardReprenable`).
 *
 * Elle était la valeur PAR DÉFAUT de la coque : tout écran neuf la promettait sans rien enregistrer
 * — l'écran du prénom, la page d'invitation, l'accueil multi-agences du prestataire. La coque ne
 * la montre plus que sur demande (`brouillon`), et les pages sont EXÉCUTÉES ici : c'est ce qu'elles
 * rendent qui est jugé, pas ce qu'on croit qu'elles passent.
 */

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

let jeton: string | null = null;
vi.mock('@/lib/session', () => ({ getToken: async () => jeton }));
vi.mock('@/lib/invitation-prerempli', () => ({ lireNomsPreremplis: async () => null }));
// TCK-2611 — la page lit l'aperçu de l'invitation avant de rendre son écran.
vi.mock('@/lib/invitation-apercu', () => ({ lireInvitation: async () => ({ issue: 'valide', apercu: {} }) }));
vi.mock('@/app/invitations/accept/EntreeDInvitation', () => ({ EntreeDInvitation: () => <p>formulaire</p> }));
vi.mock('@/app/invitations/accept/EcranFerme', () => ({ EcranFerme: ({ etat }: { etat: string }) => <p>{`lien ${etat}`}</p> }));

const getMeAction = vi.fn();
const getMyProfilesAction = vi.fn();
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/app/actions/profiles', () => ({ getMyProfilesAction: () => getMyProfilesAction() }));
vi.mock('@/components/onboarding/EtapePrenom', () => ({ EtapePrenom: () => <p>prénom</p> }));
vi.mock('@/components/onboarding/QuestionDIntention', () => ({ QuestionDIntention: () => <p>question</p> }));
vi.mock('@/components/onboarding/OwnerOnboardingWizard', () => ({ OwnerOnboardingWizard: () => <p>assistant</p> }));

const NOTE = frMessages.onboarding.shell.autosave;

/**
 * Une page serveur rend `<OnboardingShell …>`, composant ASYNCHRONE que Testing Library ne sait
 * pas monter : on l'exécute à la main avec les props que la page lui donne.
 */
async function monterLaCoque(page: Promise<ReactElement>): Promise<void> {
  const element = (await page) as ReactElement<Parameters<typeof OnboardingShell>[0]>;
  expect(element.type).toBe(OnboardingShell);
  render(await OnboardingShell(element.props));
}

beforeEach(() => {
  jeton = null;
  redirect.mockClear();
});

describe('TCK-2616 — la coque ne promet un brouillon que sur demande', () => {
  it('sans rien dire, la coque ne promet rien', async () => {
    render(await OnboardingShell({ title: 'Titre', children: <p>contenu</p> as ReactNode }));
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('`brouillon` affiche la note', async () => {
    render(await OnboardingShell({ title: 'Titre', brouillon: true, children: <p>contenu</p> }));
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });
});

describe('TCK-2616 — les pages sans brouillon ne la montrent pas', () => {
  it('l’invitation, lien complet, sans session', async () => {
    const { default: Page } = await import('@/app/invitations/accept/page');
    await monterLaCoque(Page({ searchParams: Promise.resolve({ token: 'abc' }) }));
    expect(screen.getByText('formulaire')).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('l’invitation, lien incomplet', async () => {
    const { default: Page } = await import('@/app/invitations/accept/page');
    await monterLaCoque(Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('lien incomplet')).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('l’écran du prénom de l’orientation', async () => {
    jeton = 'jeton';
    getMeAction.mockResolvedValue({ first_name: null, last_name: null, preferences: null });
    const { default: Page } = await import('@/app/onboarding/intention/page');
    await monterLaCoque(Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('prénom')).toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});

describe('TCK-2616 — un assistant qui enregistre son brouillon la garde', () => {
  it('l’assistant bailleur', async () => {
    jeton = 'jeton';
    getMyProfilesAction.mockResolvedValue({
      ok: true,
      data: { data: [{ id: 'owner:7', type: 'owner', numeric_id: 7, agency_id: 1, status: 'draft', created_at: null }] },
    });
    const { default: Page } = await import('@/app/onboarding/owner/page');
    await monterLaCoque(Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('assistant')).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });
});
