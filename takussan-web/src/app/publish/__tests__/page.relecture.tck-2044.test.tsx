/**
 * TCK-2044 (P202.05) — l'espace créé sans question par « Publier » entre dans le compte que le
 * navigateur connaît.
 *
 * Mesuré le 2026-10-24 : au retour de `autoOnboardAction`, la page invalidait la liste des
 * profils puis naviguait, sans `refreshUser()` : le contexte gardait `roles: ['customer']`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const ordre = vi.hoisted(() => [] as string[]);
const routeur = vi.hoisted(() => ({
  replace: vi.fn((url: string) => ordre.push(`replace ${url}`)),
  push: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));

const autoOnboard = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/auto-onboard', () => ({
  autoOnboardAction: (...args: unknown[]) => autoOnboard(...args),
}));

const refreshUser = vi.hoisted(() => vi.fn(async () => {
  ordre.push('refreshUser');
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, roles: ['customer'] }, isLoading: false, refreshUser }),
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

beforeEach(() => {
  vi.clearAllMocks();
  ordre.length = 0;
});

describe('/publish — relecture du compte après la création de l’espace (TCK-2044, P202.05)', () => {
  it('relit l’utilisateur avant d’ouvrir le formulaire du bien', async () => {
    autoOnboard.mockResolvedValue({ ok: true, created: true });
    render(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));

    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/app/properties/new'));
    expect(ordre).toEqual(['refreshUser', 'replace /app/properties/new']);
  });

  it('ne relit rien quand l’espace n’a pas été créé', async () => {
    autoOnboard.mockResolvedValue({ ok: false, reason: 'disabled' });
    render(withIntl(<QueryClientProvider client={new QueryClient()}><PublishPage /></QueryClientProvider>));

    await waitFor(() => expect(routeur.replace).toHaveBeenCalledWith('/onboarding/host'));
    expect(refreshUser).not.toHaveBeenCalled();
  });
});
