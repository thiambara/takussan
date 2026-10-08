/**
 * TCK-589 — AC2b : la connexion / l'inscription par téléphone n'apparaissent QUE si l'API les
 * propose (`phone_login`). Drapeau éteint : les deux pages sont celles d'avant.
 * Drapeau allumé : numéro (indicatif hors du champ), code à usage unique, second facteur si le
 * compte en a un, session ouverte, redirection — sans jamais dire si un compte existe.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

const pushMock = vi.fn();
const openSessionMock = vi.fn();
const actif = vi.fn();
const demander = vi.fn();
const verifier = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  register: vi.fn(),
  login: vi.fn(),
  isTwoFactorChallenge: () => false,
}));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  connexionParTelephoneActive: () => actif(),
  demanderCodeTelephone: (...a: unknown[]) => demander(...a),
  verifierCodeTelephone: (...a: unknown[]) => verifier(...a),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession: openSessionMock }) }));
vi.mock('@/components/auth/OAuthButtons', () => ({ OAuthButtons: () => <div />, OAuthSeparator: () => <div /> }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

const { default: LoginPage } = await import('../login/page');
const { default: RegisterPage } = await import('../register/page');

beforeEach(() => {
  pushMock.mockReset();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  actif.mockReset();
  demander.mockReset();
  verifier.mockReset();
  searchParams = new URLSearchParams();
});

async function monter(page: React.ReactElement) {
  await act(async () => {
    render(withIntl(page));
  });
}

describe('drapeau éteint (AC2b) : rien ne change', () => {
  it.each([
    ['connexion', <LoginPage key="l" />],
    ['inscription', <RegisterPage key="r" />],
  ])('%s : le formulaire e-mail, aucun champ téléphone, aucun lien vers lui', async (_nom, page) => {
    actif.mockResolvedValue(false);
    await monter(page);
    await waitFor(() => expect(actif).toHaveBeenCalled());

    expect(screen.getByLabelText(/^Adresse email/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Numéro de téléphone')).toBeNull();
    expect(screen.queryByRole('button', { name: /mon numéro de téléphone/ })).toBeNull();
  });
});

describe('drapeau allumé (AC2b)', () => {
  it('connexion : le téléphone en tête, l’e-mail en lien secondaire', async () => {
    actif.mockResolvedValue(true);
    await monter(<LoginPage />);

    const champ = await screen.findByLabelText('Numéro de téléphone');
    expect(champ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Adresse email/)).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Utiliser plutôt un e-mail et un mot de passe' }));
    expect(screen.getByLabelText(/^Adresse email/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Utiliser plutôt mon numéro de téléphone' })).toBeInTheDocument();
  });

  it('numéro → code (texte neutre, compte à rebours) → session ouverte → destination', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ redirect: '/properties/x' });
    actif.mockResolvedValue(true);
    demander.mockResolvedValue(60);
    const compte = { id: 3 };
    verifier.mockResolvedValue({ token: 'jeton', expires_at: '2026-11-06T12:00:00Z', user: compte, is_new_account: false });
    await monter(<LoginPage />);

    await user.type(await screen.findByLabelText('Numéro de téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));

    expect(demander).toHaveBeenCalledWith('+221771234567', 'fr');
    // Aucune fuite : le texte est le même que le numéro porte un compte ou non.
    expect(await screen.findByText(/Si ce numéro peut recevoir des SMS/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renvoyer le code dans 60 s' })).toBeDisabled();

    const code = screen.getByLabelText('Code reçu par SMS');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/properties/x'));
    expect(verifier).toHaveBeenCalledWith({ phone: '+221771234567', code: '123456' }, 'fr');
    expect(openSessionMock).toHaveBeenCalledWith('jeton', compte, '2026-11-06T12:00:00Z');
  });

  it('compte créé par ce code : la question d’orientation, l’intention relayée', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ redirect: '/properties/x' });
    actif.mockResolvedValue(true);
    demander.mockResolvedValue(60);
    verifier.mockResolvedValue({ token: 'jeton', user: { id: 4 }, is_new_account: true });
    await monter(<RegisterPage />);

    expect(await screen.findByText('Créez votre compte avec votre numéro')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Numéro de téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/onboarding/intention?redirect=%2Fproperties%2Fx'),
    );
  });

  it('second facteur : le code de l’application est demandé, puis renvoyé avec le code SMS', async () => {
    const user = userEvent.setup();
    actif.mockResolvedValue(true);
    demander.mockResolvedValue(60);
    verifier
      .mockResolvedValueOnce({ requires_2fa: true })
      .mockResolvedValueOnce({ token: 'jeton', user: { id: 5 } });
    await monter(<LoginPage />);

    await user.type(await screen.findByLabelText('Numéro de téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    await user.type(await screen.findByLabelText('Code à 6 chiffres'), '654321');
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/app'));
    expect(verifier).toHaveBeenLastCalledWith(
      { phone: '+221771234567', code: '123456', two_factor_code: '654321' },
      'fr',
    );
  });

  it.each([
    [new ApiError(422, { code: 'phone_code_invalid' }), 'Code incorrect ou expiré'],
    [new ApiError(423, { code: 'account_locked' }), 'Trop de tentatives'],
    [new ApiError(403, { code: 'account_blocked' }), 'Ce compte est suspendu'],
  ])('refus %#: un message qui dit quoi faire, aucune session', async (refus, attendu) => {
    const user = userEvent.setup();
    actif.mockResolvedValue(true);
    demander.mockResolvedValue(60);
    verifier.mockRejectedValue(refus);
    await monter(<LoginPage />);

    await user.type(await screen.findByLabelText('Numéro de téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
    await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(new RegExp(attendu))).toBeInTheDocument();
    expect(openSessionMock).not.toHaveBeenCalled();
  });
});
