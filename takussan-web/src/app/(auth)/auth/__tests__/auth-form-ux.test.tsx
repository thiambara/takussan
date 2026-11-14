import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VoieEmail } from '@/components/auth/VoieEmail';
import ResetPasswordPage from '../reset-password/page';
// TCK-286 — les deux pages passent par next-intl ; seules les enveloppes de rendu changent.
import { withIntl } from '@/test/intl';

const registerMock = vi.fn();
const resetPasswordMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  register: (...args: unknown[]) => registerMock(...args),
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
  login: vi.fn(),
  isTwoFactorChallenge: () => false,
  // TCK-2606 — numéro fermé, la voie e-mail montre les autres voies sous le formulaire (`AutresVoies`).
  oauthProviders: async () => [{ provider: 'google', configured: true }],
  oauthRedirect: vi.fn(),
}));


vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

// TCK-2604 — `/auth/register` redirige vers la connexion ; TCK-2606 — l'inscription par e-mail est
// l'onglet « Créer un compte » de la voie e-mail (`?voie=inscription`).
function RegisterPage() {
  return (
    <VoieEmail
      intention={null}
      redirect={searchParams.get('redirect')}
      action={null}
      ongletInitial="creation"
      erreurOAuth={null}
      motDePasseModifie={false}
    />
  );
}

describe('auth form UX', () => {
  beforeEach(() => {
    registerMock.mockReset();
    resetPasswordMock.mockReset();
    pushMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it('renders the register form before the OAuth section', async () => {
    render(withIntl(<RegisterPage />));

    const submit = screen.getByRole('button', { name: 'Créer mon compte' });
    const oauth = await screen.findByRole('button', { name: /Google/ });

    expect(submit.compareDocumentPosition(oauth)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('TCK-2606 — trois contrôles, l’œil à la place de la confirmation, validation en français', async () => {
    const user = userEvent.setup();
    render(withIntl(<RegisterPage />));

    const password = screen.getByLabelText('Mot de passe');
    expect(screen.queryByLabelText(/Confirmer le mot de passe/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Prénom/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Nom/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }));
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await waitFor(() => {
      expect(screen.getByText('Le mot de passe est requis.')).toBeInTheDocument();
      expect(screen.getByText('Vous devez accepter les conditions générales.')).toBeInTheDocument();
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('keeps reset password toggles independent', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams('token=reset-token&email=agent1%40dakarimmo.sn');

    render(withIntl(<ResetPasswordPage />));

    const password = screen.getByLabelText('Nouveau mot de passe');
    const confirmation = screen.getByLabelText('Confirmer le mot de passe');

    await user.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByRole('button', { name: 'Afficher la confirmation du mot de passe' }),
    );
    expect(confirmation).toHaveAttribute('type', 'text');
  });

  // TCK-1451 (P159.04) — `Password::defaults()` exige une lettre et un chiffre : l'aide le dit.
  it('annonce la lettre et le chiffre exigés, à la réinitialisation comme à l\'inscription', () => {
    searchParams = new URLSearchParams('token=reset-token&email=agent1%40dakarimmo.sn');
    const { unmount } = render(withIntl(<ResetPasswordPage />));
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute(
      'placeholder',
      '8 caractères minimum, avec une lettre et un chiffre.',
    );
    unmount();

    // TCK-2606 — à l'inscription, la règle est écrite SOUS le champ, plus en `placeholder`.
    render(withIntl(<RegisterPage />));
    expect(screen.getByLabelText('Mot de passe')).toHaveAccessibleDescription(
      expect.stringContaining('8 caractères minimum, avec une lettre et un chiffre.'),
    );
  });
});
