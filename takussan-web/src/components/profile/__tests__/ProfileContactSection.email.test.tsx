import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileContactSection } from '../ProfileContactSection';
import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

/**
 * TCK-632 — un compte ouvert par téléphone ajoute, puis vérifie, son adresse e-mail depuis le
 * profil. Le champ était `disabled` et rien n'appelait le renvoi du lien.
 *
 * | test | régression attrapée |
 * |---|---|
 * | ajout envoyé, lien annoncé | le champ en lecture seule — aucune voie d'ajout |
 * | renvoi du lien | une adresse « non vérifiée » sans geste pour la vérifier |
 * | adresse vérifiée non envoyée | un 403 de l'API sur chaque enregistrement de la bio |
 * | variante de casse | un lien renvoyé à chaque enregistrement |
 * | adresse vidée refusée | une adresse retirée sans que l'API le permette |
 */
const { updateProfileMock, resendMock, setUserMock } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  resendMock: vi.fn(),
  setUserMock: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileMock(fd),
  resendVerificationEmailAction: () => resendMock(),
}));

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: vi.fn(),
  phoneVerifyOtpAction: vi.fn(),
  phoneChangeCodeAction: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, setUser: setUserMock }),
}));

const COMPTE_TELEPHONE: User = {
  id: 7,
  first_name: '',
  last_name: '',
  full_name: '',
  email: null,
  phone: '+221770000632',
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: '2026-10-01T00:00:00Z',
  two_factor_enabled: false,
  agency_id: null,
  roles: ['customer'],
  status: 'active',
  created_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  updateProfileMock.mockReset();
  resendMock.mockReset();
  setUserMock.mockReset();
});

describe('<ProfileContactSection> — adresse e-mail (TCK-632)', () => {
  it('un compte ouvert par téléphone ajoute une adresse, et le lien est annoncé', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({
      ok: true,
      user: { ...COMPTE_TELEPHONE, email: 'awa@example.sn', email_verified_at: null },
    });
    render(withIntl(<ProfileContactSection user={COMPTE_TELEPHONE} />));

    const champ = screen.getByLabelText('Email');
    expect(champ).not.toBeDisabled();
    expect(champ).not.toHaveAttribute('readonly');
    expect(screen.getByText(/nous vous enverrons un lien/i)).toBeInTheDocument();

    await user.type(champ, 'awa@example.sn');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() =>
      expect(screen.getByText('Lien de vérification envoyé à awa@example.sn.')).toBeInTheDocument(),
    );
    const fd = updateProfileMock.mock.calls[0][0] as FormData;
    expect(fd.get('email')).toBe('awa@example.sn');
    expect(screen.getByTestId('email-status-badge')).toHaveTextContent('Non vérifié');
    expect(screen.getByTestId('email-verify-block')).toBeInTheDocument();
  });

  it('« Renvoyer le lien » appelle le renvoi et l’annonce', async () => {
    const user = userEvent.setup();
    resendMock.mockResolvedValue({ ok: true });
    render(withIntl(<ProfileContactSection user={{ ...COMPTE_TELEPHONE, email: 'awa@example.sn' }} />));

    await user.click(screen.getByRole('button', { name: 'Renvoyer le lien' }));

    expect(resendMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Lien de vérification envoyé à awa@example.sn.')).toBeInTheDocument();
  });

  it('une adresse vérifiée reste en lecture seule et ne part pas avec la bio', async () => {
    const user = userEvent.setup();
    const verifie = { ...COMPTE_TELEPHONE, email: 'awa@example.sn', email_verified_at: '2026-10-02T00:00:00Z' };
    updateProfileMock.mockResolvedValue({ ok: true, user: { ...verifie, bio: 'Bio' } });
    render(withIntl(<ProfileContactSection user={verifie} />));

    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.queryByTestId('email-verify-block')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Bio'), 'Bio');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect((updateProfileMock.mock.calls[0][0] as FormData).has('email')).toBe(false);
  });

  it('une simple variante de casse n’est pas une modification', async () => {
    const user = userEvent.setup();
    render(withIntl(<ProfileContactSection user={{ ...COMPTE_TELEPHONE, email: 'awa@example.sn' }} />));

    const champ = screen.getByLabelText('Email');
    await user.clear(champ);
    await user.type(champ, 'AWA@example.sn');

    expect(screen.getByTestId('contact-save')).toBeDisabled();
  });

  it('une adresse invalide, ou vidée, bloque l’enregistrement', async () => {
    const user = userEvent.setup();
    render(withIntl(<ProfileContactSection user={{ ...COMPTE_TELEPHONE, email: 'awa@example.sn' }} />));

    const champ = screen.getByLabelText('Email');
    await user.clear(champ);
    expect(screen.getByRole('alert')).toHaveTextContent(/adresse e-mail valide/i);
    expect(screen.getByTestId('contact-save')).toBeDisabled();

    await user.type(champ, 'pas-une-adresse');
    expect(screen.getByRole('alert')).toHaveTextContent(/adresse e-mail valide/i);
    expect(screen.getByTestId('contact-save')).toBeDisabled();
  });
});
