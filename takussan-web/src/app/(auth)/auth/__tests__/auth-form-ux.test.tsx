import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RegisterPage from '../register/page';
import ResetPasswordPage from '../reset-password/page';

const registerMock = vi.fn();
const resetPasswordMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', () => ({
  register: (...args: unknown[]) => registerMock(...args),
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));

vi.mock('@/components/auth/OAuthButtons', () => ({
  OAuthButtons: () => (
    <div>
      <button type="button">Continuer avec Google</button>
    </div>
  ),
  OAuthSeparator: ({ label = 'ou continuer avec email' }: { label?: string }) => (
    <p>{label}</p>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}));

describe('auth form UX', () => {
  beforeEach(() => {
    registerMock.mockReset();
    resetPasswordMock.mockReset();
    pushMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it('renders the register form before the OAuth section', () => {
    render(<RegisterPage />);

    const submit = screen.getByRole('button', { name: 'Créer mon compte' });
    const oauth = screen.getByRole('button', { name: 'Continuer avec Google' });

    expect(submit.compareDocumentPosition(oauth)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('ou créer un compte avec')).toBeInTheDocument();
  });

  it('keeps register password toggles independent and validates in French', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const password = screen.getByLabelText('Mot de passe*');
    const confirmation = screen.getByLabelText('Confirmer le mot de passe*');

    await user.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(confirmation).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByRole('button', { name: 'Afficher la confirmation du mot de passe' }),
    );
    expect(confirmation).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await waitFor(() => {
      expect(screen.getByText('Le prénom est requis.')).toBeInTheDocument();
      expect(screen.getByText('Le nom est requis.')).toBeInTheDocument();
      expect(screen.getByText('Le mot de passe est requis.')).toBeInTheDocument();
      expect(screen.getByText('Vous devez accepter les conditions générales.')).toBeInTheDocument();
    });
  });

  it('keeps reset password toggles independent', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams('token=reset-token&email=agent1%40dakarimmo.sn');

    render(<ResetPasswordPage />);

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
});
