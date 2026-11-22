/**
 * TCK-2600 (AC1) — `/publish` sans compte sert l'assistant au lieu de renvoyer à la connexion ; un
 * visiteur connecté suit la décision d'aujourd'hui (`usePublishIntent`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const routeur = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));

const decision = vi.hoisted(() => ({
  courante: { status: 'anonymous', target: '/auth/login?redirect=/publish&intention=publication', espaces: [], profilABasculer: null } as {
    status: string;
    target: string | null;
    espaces: never[];
    profilABasculer: string | null;
  },
}));
vi.mock('@/hooks/usePublishIntent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePublishIntent')>()),
  usePublishIntent: () => decision.courante,
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, refreshUser: vi.fn(), setActiveProfileId: vi.fn() }),
}));
vi.mock('@/hooks/useProfiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useProfiles')>()),
  useSwitchActiveProfile: () => ({ mutateAsync: vi.fn() }),
}));
const local = vi.hoisted(() => ({ present: false as boolean | 'verse' | null }));
vi.mock('@/lib/publication/useBrouillonLocalPresent', () => ({ useBrouillonLocalPresent: () => local.present }));
vi.mock('@/components/publication/PublierSansCompte', () => ({
  PublierSansCompte: () => <p>assistant sans compte</p>,
}));
const autoOnboard = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/auto-onboard', () => ({ autoOnboardAction: autoOnboard }));

const { default: PublishPage } = await import('../page');

function monter() {
  return render(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));
}

beforeEach(() => {
  vi.clearAllMocks();
  local.present = false;
});

describe('/publish sans compte (TCK-2600, AC1)', () => {
  it('sert l’assistant, sans aucune navigation vers la connexion', async () => {
    monter();
    expect(screen.getByText('assistant sans compte')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(routeur.replace).not.toHaveBeenCalled();
    expect(routeur.push).not.toHaveBeenCalled();
  });

  // TCK-2601 — la feuille de compte ouvre la session SUR cette page : la décision passe d'« anonyme »
  // à « chargement » puis à « aucun espace ». L'assistant (son annonce, ses photos, ses contacts en
  // mémoire) reste monté, et la page ne crée ni ne navigue : c'est la feuille qui mène la suite.
  it('une session ouverte pendant la feuille ne démonte pas l’assistant, et la page ne décide plus rien', async () => {
    decision.courante = { status: 'anonymous', target: '/auth/login?redirect=/publish&intention=publication', espaces: [], profilABasculer: null };
    const { rerender } = monter();
    expect(screen.getByText('assistant sans compte')).toBeInTheDocument();
    for (const status of ['loading', 'host-needed', 'single-space', 'choose-space']) {
      decision.courante = { status, target: status === 'single-space' ? '/app/properties/new' : null, espaces: [], profilABasculer: null };
      rerender(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));
      expect(screen.getByText('assistant sans compte'), status).toBeInTheDocument();
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(autoOnboard).not.toHaveBeenCalled();
    expect(routeur.replace).not.toHaveBeenCalled();
    expect(routeur.push).not.toHaveBeenCalled();
  });

  // TCK-2601 — un visiteur qui ARRIVE connecté (rechargement, retour de Google) avec une annonce gardée
  // dans ce navigateur la retrouve : l'assistant, et sa feuille réduite à ce qui manque.
  it('connecté avec une annonce gardée dans ce navigateur : l’assistant, aucune navigation', async () => {
    local.present = true;
    decision.courante = { status: 'single-space', target: '/app/properties/new', espaces: [], profilABasculer: null };
    monter();
    expect(screen.getByText('assistant sans compte')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(routeur.replace).not.toHaveBeenCalled();
  });

  it('tant que le brouillon local n’est pas lu, la page ne mène nulle part et ne crée rien', async () => {
    local.present = null;
    decision.courante = { status: 'host-needed', target: '/onboarding/host', espaces: [], profilABasculer: null };
    const { rerender } = monter();
    await new Promise((r) => setTimeout(r, 50));
    expect(autoOnboard).not.toHaveBeenCalled();
    expect(routeur.replace).not.toHaveBeenCalled();

    local.present = false;
    autoOnboard.mockResolvedValue({ ok: false, reason: 'disabled' });
    rerender(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));
    await waitFor(() => expect(autoOnboard).toHaveBeenCalledTimes(1));
  });

  // TCK-2601 (r1) — revenue par « Précédent » après le versement : ni l'assistant sans compte (qui
  // reverserait l'ancienne copie), ni une autre décision — la reprise de l'annonce versée.
  it.each([
    ['connecté, plusieurs espaces', { status: 'choose-space', target: null, espaces: [], profilABasculer: null }],
    ['connecté, un espace', { status: 'single-space', target: '/app/properties/new', espaces: [], profilABasculer: 'p-1' }],
    ['sans session', { status: 'anonymous', target: '/auth/login?redirect=/publish&intention=publication', espaces: [], profilABasculer: null }],
  ])('annonce déjà versée (%s) : la reprise dans l’assistant connecté, et rien d’autre', async (_cas, courante) => {
    local.present = 'verse';
    decision.courante = courante;
    monter();
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new?brouillon=publication'));
    expect(screen.queryByText('assistant sans compte')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Où publier ce bien ?' })).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(routeur.replace).toHaveBeenCalledTimes(1);
    expect(autoOnboard).not.toHaveBeenCalled();
  });

  it('connecté avec un seul espace : le formulaire du bien, comme aujourd’hui', async () => {
    decision.courante = { status: 'single-space', target: '/app/properties/new', espaces: [], profilABasculer: null };
    monter();
    expect(screen.queryByText('assistant sans compte')).not.toBeInTheDocument();
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new'));
  });
});
