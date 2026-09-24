/**
 * Après la connexion, on revient à la page quittée — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * `/auth/login` suit `?redirect=` ; le lien « Connexion » l'y pose (`hrefConnexion`). Ces tests
 * éprouvent le bout « lecture » : la recherche filtrée est rendue telle quelle, et une destination
 * qui sortirait du site retombe sur `/app`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const pushMock = vi.fn();
const loginMock = vi.fn();
const openSessionMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
  isTwoFactorChallenge: () => false,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: openSessionMock }),
}));

vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => <div />,
  OAuthSeparator: () => <div />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const { default: LoginPage } = await import('../login/page');

async function seConnecter() {
  const user = userEvent.setup();
  render(withIntl(<LoginPage />));
  await user.type(screen.getByLabelText(/Adresse email/), 'fa.diop@example.com');
  await user.type(screen.getByLabelText(/Mot de passe/), 'secret123');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
  await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
  return pushMock.mock.calls[0]![0] as string;
}

beforeEach(() => {
  pushMock.mockReset();
  loginMock.mockReset();
  openSessionMock.mockReset();
  loginMock.mockResolvedValue({ token: 'jeton', user: { id: 1 } });
  openSessionMock.mockResolvedValue(undefined);
});

describe('la destination après connexion', () => {
  it('rend la recherche quittée, filtres compris', async () => {
    searchParams = new URLSearchParams({ redirect: '/fr/properties?type=office&city=Dakar' });
    expect(await seConnecter()).toBe('/fr/properties?type=office&city=Dakar');
  });

  it('sans destination, l’espace personnel — comme avant', async () => {
    searchParams = new URLSearchParams();
    expect(await seConnecter()).toBe('/app');
  });

  it.each(['//evil.tld', '/\\evil.tld', 'https://evil.tld'])(
    'ne suit jamais %s hors du site',
    async (brute) => {
      searchParams = new URLSearchParams({ redirect: brute });
      expect(await seConnecter()).toBe('/app');
    },
  );
});
