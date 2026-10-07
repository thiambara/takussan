/**
 * TCK-589 — le retour OAuth rend l'intention posée au départ quand l'URL de rappel n'en porte pas
 * (le fournisseur ne rappelle qu'avec `code` et `state`).
 */
import { act, render, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CLE_INTENTION_OAUTH } from '@/components/auth/intention-oauth';

const replaceMock = vi.fn();
const oauthCallbackMock = vi.fn();
const openSessionMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  oauthCallback: (...args: unknown[]) => oauthCallbackMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: openSessionMock, refreshUser: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

const { default: OAuthCallbackPage } = await import('../oauth/[provider]/callback/page');

async function revenir(): Promise<string> {
  const params = Promise.resolve({ provider: 'google' });
  await act(async () => {
    render(withIntl(<Suspense><OAuthCallbackPage params={params} /></Suspense>));
  });
  await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
  return replaceMock.mock.calls[0]![0] as string;
}

beforeEach(() => {
  replaceMock.mockReset();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  oauthCallbackMock.mockReset();
  oauthCallbackMock.mockResolvedValue({ token: 't', user: { id: 1 }, expires_at: '2026-11-06T12:00:00Z' });
  window.sessionStorage.clear();
  searchParams = new URLSearchParams({ code: 'c', state: 's' });
});

describe('retour OAuth et intention d’origine', () => {
  it('sans redirect dans l’URL, reprend l’intention mémorisée puis l’oublie', async () => {
    window.sessionStorage.setItem(CLE_INTENTION_OAUTH, '/properties/x?action=reserver');
    expect(await revenir()).toBe(
      `/onboarding/intention?redirect=${encodeURIComponent('/properties/x?action=reserver')}`,
    );
    expect(openSessionMock).toHaveBeenCalledWith('t', { id: 1 }, '2026-11-06T12:00:00Z');
    expect(window.sessionStorage.getItem(CLE_INTENTION_OAUTH)).toBeNull();
  });

  it('sans intention nulle part : /app, comme avant', async () => {
    expect(await revenir()).toBe(`/onboarding/intention?redirect=${encodeURIComponent('/app')}`);
  });
});
