/**
 * TCK-633 (lot C) — « Publier » sans espace : drapeau allumé, l'espace se crée puis le formulaire
 * s'ouvre ; drapeau éteint (le SERVEUR le dit, 403), l'assistant actuel, intact.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const routeur = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));

const autoOnboard = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/auto-onboard', () => ({
  autoOnboardAction: (...args: unknown[]) => autoOnboard(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, preferences: { city: 'Thiès' } }, isLoading: false, refreshUser: vi.fn() }),
}));

vi.mock('@/hooks/useProfiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useProfiles')>()),
  useSwitchActiveProfile: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/usePublishIntent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/usePublishIntent')>()),
  usePublishIntent: () => ({ status: 'host-needed', target: '/onboarding/host', espaces: [], profilABasculer: null }),
}));

const { default: PublishPage } = await import('../page');

function monter() {
  return render(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('/publish — création automatique de l’espace (TCK-633)', () => {
  it('drapeau allumé : crée l’espace, puis ouvre le formulaire du bien', async () => {
    autoOnboard.mockResolvedValue({ ok: true, created: true });
    monter();

    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new'));
    expect(autoOnboard).toHaveBeenCalledWith('Thiès');
    expect(routeur.replace).not.toHaveBeenCalledWith('/onboarding/host');
    expect(screen.getByText('Création de votre espace…')).toBeInTheDocument();
  });

  it('drapeau éteint : l’assistant actuel', async () => {
    autoOnboard.mockResolvedValue({ ok: false, reason: 'disabled' });
    monter();

    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/onboarding/host'));
  });

  it('un échec se dit, et « Réessayer » recrée', async () => {
    autoOnboard.mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValueOnce({ ok: true, created: false });
    const user = userEvent.setup();
    monter();

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre espace n’a pas pu être créé. Réessayez.');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new'));
    expect(autoOnboard).toHaveBeenCalledTimes(2);
  });

  it('le message localisé rendu par l’action est celui qu’on lit', async () => {
    autoOnboard.mockResolvedValue({ ok: false, reason: 'failed', message: 'La ville est trop longue.' });
    monter();

    expect(await screen.findByRole('alert')).toHaveTextContent(/^La ville est trop longue\.$/);
  });
});
