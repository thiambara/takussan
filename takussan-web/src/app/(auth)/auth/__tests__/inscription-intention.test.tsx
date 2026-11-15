/**
 * TCK-589 — AC5 / AC5b : l'inscription ouvre la session avec le jeton reçu, jamais sans jeton, et
 * l'intention d'origine (`?redirect=`) traverse connexion → inscription → vérification de
 * l'e-mail → `/onboarding/intention`.
 *
 * TCK-2606 — l'inscription est l'onglet « Créer un compte » de la voie e-mail (`VoieEmail`) : trois
 * contrôles, `{email, password}` seulement, et le geste (`?intention=`) suit le `redirect`. L'écran
 * « Vérifiez votre adresse » est éprouvé par `oubli-et-verification.tck-2606.test.tsx`.
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
  oauthProviders: async () => [],
  oauthRedirect: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ openSession: openSessionMock }),
}));


vi.mock('@/app/actions/auth', () => ({ resendVerificationEmailAction: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const { VoieEmail } = await import('@/components/auth/VoieEmail');
const { lireActionDEntree } = await import('@/components/auth/lien-connexion');
// TCK-2604 — `/auth/register` redirige vers la connexion (`?voie=inscription`) ; TCK-2606 — son
// formulaire est l'onglet « Créer un compte » de la voie e-mail.
function RegisterPage() {
  return (
    <VoieEmail
      intention={null}
      redirect={searchParams.get('redirect')}
      action={lireActionDEntree(searchParams.get('intention'))}
      ongletInitial="creation"
      erreurOAuth={null}
      motDePasseModifie={false}
    />
  );
}
const { FormulaireDeConnexion: LoginPage } = await import('../login/FormulaireDeConnexion');

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
  await user.type(screen.getByLabelText('E-mail'), 'fatou.diop@example.com');
  await user.type(screen.getByLabelText('Mot de passe'), 'Secret123!');
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

  it('AC1 (TCK-2606) — n’envoie que l’adresse et le mot de passe : ni prénom, ni nom, ni confirmation', async () => {
    registerMock.mockResolvedValue({ token: 'jeton', expires_at: null, user: { id: 12 }, message: 'ok' });

    await sInscrire();

    expect(registerMock).toHaveBeenCalledWith({ email: 'fatou.diop@example.com', password: 'Secret123!' });
  });

  it('le geste interrompu suit la page à rouvrir jusqu’à la vérification de l’adresse', async () => {
    searchParams = new URLSearchParams({ redirect: '/properties/villa-ngor', intention: 'reservation' });
    registerMock.mockResolvedValue({ token: 'jeton', expires_at: null, user: { id: 12 }, message: 'ok' });

    await sInscrire();

    expect(pushMock).toHaveBeenCalledWith('/auth/verify-email?redirect=%2Fproperties%2Fvilla-ngor&intention=reservation');
  });

  it('sans jeton dans la réponse : aucune session ouverte, aucun set-token, retour à la connexion', async () => {
    registerMock.mockResolvedValue({ user: { id: 12 }, message: 'ok' });

    await sInscrire();

    expect(openSessionMock).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/auth/set-token'))).toBe(false);
    expect(pushMock).toHaveBeenCalledWith('/auth/login?voie=email');
  });

  it('l’onglet « J’ai un compte » revient à la connexion sans quitter la page', async () => {
    searchParams = new URLSearchParams({ redirect: '/properties/villa-ngor' });
    render(withIntl(<RegisterPage />));
    await userEvent.setup().click(screen.getByRole('tab', { name: 'J’ai un compte' }));
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

// TCK-2604 — `/auth/register` redirige vers la connexion ; TCK-2606 — l'onglet « Créer un compte » y
// ouvre l'inscription sur place, et c'est elle qui porte l'intention jusqu'à la vérification.
describe('AC5b — « Créer un compte » de la connexion porte le redirect assaini', () => {
  async function sInscrireDepuisLaConnexion(): Promise<void> {
    const user = userEvent.setup();
    registerMock.mockResolvedValue({ token: 'jeton', expires_at: null, user: { id: 1 }, message: 'ok' });
    render(withIntl(<LoginPage />));
    await user.click(screen.getByRole('tab', { name: 'Créer un compte' }));
    await user.type(screen.getByLabelText('E-mail'), 'fatou.diop@example.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'Secret123!');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
  }

  it('/auth/login?redirect=/properties/x → l’inscription la porte, encodée', async () => {
    searchParams = new URLSearchParams({ redirect: '/properties/x' });
    await sInscrireDepuisLaConnexion();
    expect(pushMock).toHaveBeenCalledWith('/auth/verify-email?redirect=%2Fproperties%2Fx');
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example'])(
    '%s est abandonnée : la suite reste nue',
    async (brute) => {
      searchParams = new URLSearchParams({ redirect: brute });
      await sInscrireDepuisLaConnexion();
      expect(pushMock).toHaveBeenCalledWith('/auth/verify-email');
    },
  );
});
