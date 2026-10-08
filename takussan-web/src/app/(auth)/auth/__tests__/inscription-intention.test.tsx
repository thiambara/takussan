/**
 * TCK-589 — AC5 / AC5b : l'inscription ouvre la session avec le jeton reçu, jamais sans jeton, et
 * l'intention d'origine (`?redirect=`) traverse connexion → inscription → vérification de
 * l'e-mail → `/onboarding/intention`.
 *
 * ⚠ « jamais sans jeton » s'éprouve sur DEUX témoins : `openSession` (seul chemin vers le cookie,
 * garde `AuthContext.chemin-unique`) et `fetch` — un `set-token` reçu vide EFFACE le cookie.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const pushMock = vi.fn();
const registerMock = vi.fn();
const openSessionMock = vi.fn();
const fetchMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  register: (...args: unknown[]) => registerMock(...args),
  login: vi.fn(),
  isTwoFactorChallenge: () => false,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: openSessionMock }),
}));

vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => <div />,
  OAuthSeparator: () => <div />,
}));

vi.mock('@/app/actions/auth', () => ({ resendVerificationEmailAction: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const { default: RegisterPage } = await import('../register/page');
const { default: LoginPage } = await import('../login/page');
const { default: VerifyEmailPage } = await import('../verify-email/page');

beforeEach(() => {
  pushMock.mockReset();
  registerMock.mockReset();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  searchParams = new URLSearchParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sInscrire(): Promise<void> {
  const user = userEvent.setup();
  render(withIntl(<RegisterPage />));
  await user.type(screen.getByLabelText(/^Prénom/), 'Fatou');
  await user.type(screen.getByLabelText(/^Nom/), 'Diop');
  await user.type(screen.getByLabelText(/^Adresse email/), 'fatou.diop@example.com');
  await user.type(screen.getByLabelText(/^Mot de passe/), 'Secret123!');
  await user.type(screen.getByLabelText(/^Confirmer le mot de passe/), 'Secret123!');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
  await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
}

describe('AC5 — l’inscription ouvre la session avec le jeton reçu', () => {
  it('ouvre la session avec le jeton ET son expiration, puis va vérifier l’e-mail en portant l’intention', async () => {
    searchParams = new URLSearchParams({ redirect: '/properties/villa-ngor?action=reserver' });
    const user = { id: 12, email: 'fatou.diop@example.com' };
    registerMock.mockResolvedValue({
      token: 'jeton-inscription',
      expires_at: '2026-11-06T12:00:00Z',
      user,
      message: 'ok',
    });

    await sInscrire();

    expect(openSessionMock).toHaveBeenCalledWith('jeton-inscription', user, '2026-11-06T12:00:00Z');
    expect(pushMock).toHaveBeenCalledWith(
      `/auth/verify-email?redirect=${encodeURIComponent('/properties/villa-ngor?action=reserver')}`,
    );
  });

  it('sans jeton dans la réponse : aucune session ouverte, aucun set-token, retour à la connexion', async () => {
    registerMock.mockResolvedValue({ user: { id: 12 }, message: 'ok' });

    await sInscrire();

    expect(openSessionMock).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/auth/set-token'))).toBe(false);
    expect(pushMock).toHaveBeenCalledWith('/auth/login');
  });

  it('« Déjà un compte ? » garde l’intention', () => {
    searchParams = new URLSearchParams({ redirect: '/properties/villa-ngor' });
    render(withIntl(<RegisterPage />));
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fproperties%2Fvilla-ngor',
    );
  });
});

describe('AC5b — « Créer un compte » de la connexion porte le redirect assaini', () => {
  it('/auth/login?redirect=/properties/x → le lien d’inscription la porte, encodée', () => {
    searchParams = new URLSearchParams({ redirect: '/properties/x' });
    render(withIntl(<LoginPage />));
    expect(screen.getByRole('link', { name: "S'inscrire" })).toHaveAttribute(
      'href',
      '/auth/register?redirect=%2Fproperties%2Fx',
    );
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example'])(
    '%s est abandonnée : le lien reste nu',
    (brute) => {
      searchParams = new URLSearchParams({ redirect: brute });
      render(withIntl(<LoginPage />));
      expect(screen.getByRole('link', { name: "S'inscrire" })).toHaveAttribute('href', '/auth/register');
    },
  );
});

describe('la vérification de l’e-mail relaie l’intention à /onboarding/intention', () => {
  it('« Continuer » porte la destination', () => {
    searchParams = new URLSearchParams({ redirect: '/properties/x?action=reserver' });
    render(withIntl(<VerifyEmailPage />));
    expect(screen.getByRole('link', { name: 'Continuer vers le tableau de bord' })).toHaveAttribute(
      'href',
      `/onboarding/intention?redirect=${encodeURIComponent('/properties/x?action=reserver')}`,
    );
  });

  it('une destination hors du site n’est pas relayée', () => {
    searchParams = new URLSearchParams({ redirect: '//evil.example' });
    render(withIntl(<VerifyEmailPage />));
    expect(screen.getByRole('link', { name: 'Continuer vers le tableau de bord' })).toHaveAttribute(
      'href',
      '/onboarding/intention',
    );
  });
});
