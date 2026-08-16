import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyEmailHashPage from '../verify-email/[id]/[hash]/page';
import ResetPasswordPage from '../reset-password/page';
import LoginPage from '../login/page';
// TCK-286 — `withIntl` pour les pages CLIENT ; `mockTraductionsServeur` pour la page de
// vérification, qui est un composant serveur : `getTranslations` y résout la locale via
// `next/headers`, absent sous jsdom. Les assertions sont inchangées.
import { withIntl } from '@/test/intl';

const apiRequestMock = vi.fn();
const getTokenMock = vi.fn();
const resetPasswordMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/lib/session', () => ({
  getToken: () => getTokenMock(),
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly data: unknown,
    ) {
      super(`API error ${status}`);
    }
  },
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock('@/lib/auth', () => ({
  login: vi.fn(),
  isTwoFactorChallenge: vi.fn(() => false),
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ setUser: vi.fn() }),
}));

vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => <div />,
  OAuthSeparator: () => <div />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

describe('transactional auth links', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    getTokenMock.mockReset();
    resetPasswordMock.mockReset();
    pushMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it('consumes the frontend email verification link through the signed API path', async () => {
    getTokenMock.mockResolvedValue('token-123');
    apiRequestMock.mockResolvedValue({ message: 'Email verified successfully.' });

    render(
      await VerifyEmailHashPage({
        params: Promise.resolve({ id: '42', hash: 'abc123' }),
        searchParams: Promise.resolve({
          expires: '1778246400',
          signature: 'signed',
        }),
      }),
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/auth/verify-email/42/abc123?expires=1778246400&signature=signed',
      { token: 'token-123' },
    );
    expect(screen.getByText('Adresse email vérifiée')).toBeInTheDocument();
  });

  it('submits a reset link and redirects to the login success message', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams(
      'token=reset-token&email=astou%40example.com',
    );
    resetPasswordMock.mockResolvedValue({ message: 'Password reset.' });

    render(withIntl(<ResetPasswordPage />));

    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'newpassword123');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'newpassword123');
    await user.click(
      screen.getByRole('button', { name: 'Définir le nouveau mot de passe' }),
    );

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        token: 'reset-token',
        email: 'astou@example.com',
        password: 'newpassword123',
        password_confirmation: 'newpassword123',
      }),
    );
    expect(pushMock).toHaveBeenCalledWith('/auth/login?reset=1');
  });

  it('shows the reset success message on the login page', () => {
    searchParams = new URLSearchParams('reset=1');

    render(withIntl(<LoginPage />));

    expect(
      screen.getByText(
        'Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.',
      ),
    ).toBeInTheDocument();
  });
});
