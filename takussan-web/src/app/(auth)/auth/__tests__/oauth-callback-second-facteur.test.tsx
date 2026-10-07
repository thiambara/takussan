/**
 * TCK-589, vérification adverse B2 — le rappel OAuth d'un compte à 2FA ne rend plus de jeton
 * mais un défi : la page affiche la saisie du second facteur, et la session ne s'ouvre
 * qu'après `POST /api/auth/oauth/2fa`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';

const replaceMock = vi.fn();
const oauthCallbackMock = vi.fn();
const oauthSecondFactorMock = vi.fn();
const openSessionMock = vi.fn();

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  oauthCallback: (...args: unknown[]) => oauthCallbackMock(...args),
  oauthSecondFactor: (...args: unknown[]) => oauthSecondFactorMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: openSessionMock, refreshUser: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams({ code: 'c', state: 's' }),
}));

const { default: OAuthCallbackPage } = await import('../oauth/[provider]/callback/page');

async function revenir() {
  const params = Promise.resolve({ provider: 'google' });
  await act(async () => {
    render(withIntl(<Suspense><OAuthCallbackPage params={params} /></Suspense>));
  });
}

beforeEach(() => {
  replaceMock.mockReset();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  oauthSecondFactorMock.mockReset();
  oauthCallbackMock.mockReset();
  oauthCallbackMock.mockResolvedValue({ requires_2fa: true, challenge: 'defi-1' });
  window.sessionStorage.clear();
});

describe('rappel OAuth d’un compte à double facteur', () => {
  it('n’ouvre aucune session et demande le code', async () => {
    await revenir();
    expect(await screen.findByLabelText('Code à 6 chiffres')).toBeTruthy();
    expect(openSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('ouvre la session avec le jeton rendu par le défi', async () => {
    oauthSecondFactorMock.mockResolvedValue({ token: 't2', user: { id: 1 }, expires_at: '2026-11-06T12:00:00Z' });
    await revenir();
    fireEvent.change(await screen.findByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    });

    expect(oauthSecondFactorMock).toHaveBeenCalledWith('defi-1', { two_factor_code: '123456' });
    await waitFor(() => expect(openSessionMock).toHaveBeenCalledWith('t2', { id: 1 }, '2026-11-06T12:00:00Z'));
    expect(replaceMock).toHaveBeenCalledWith(`/onboarding/intention?redirect=${encodeURIComponent('/app')}`);
  });

  it('un code refusé garde la saisie ouverte, sans session', async () => {
    oauthSecondFactorMock.mockRejectedValue(new ApiError(401, { requires_2fa: true, message: 'Code invalide.' }));
    await revenir();
    fireEvent.change(await screen.findByLabelText('Code à 6 chiffres'), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    });

    expect(await screen.findByLabelText('Code à 6 chiffres')).toBeTruthy();
    expect(openSessionMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('un code de récupération passe sous son propre champ', async () => {
    oauthSecondFactorMock.mockResolvedValue({ token: 't3', user: { id: 1 } });
    await revenir();
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser un code de récupération' }));
    fireEvent.change(screen.getByLabelText('Code de récupération'), { target: { value: 'aaaaa-bbbbb' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    });

    expect(oauthSecondFactorMock).toHaveBeenCalledWith('defi-1', { recovery_code: 'AAAAA-BBBBB' });
  });
});
