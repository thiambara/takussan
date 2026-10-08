import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileContactSection } from '../ProfileContactSection';
import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

/**
 * TCK-589, vérification adverse passe 3 (p3-1) — remplacer un numéro VÉRIFIÉ exige une preuve
 * sur le facteur en place (`PhoneChangeGuard` côté API, 403 `phone.change_requires_proof`
 * sans elle). L'écran la demande : le mot de passe actuel quand le compte en a un, ou un code
 * reçu sur l'ancien numéro (`POST /auth/phone/change-code`), et la transmet avec le numéro.
 *
 * Rouge sur bd0dabb3 : aucune preuve n'était demandée ni transmise — l'écran envoyait le
 * nouveau numéro seul, et l'API le refuse désormais.
 */

const { updateProfileMock, changeCodeMock, setUserMock } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
  changeCodeMock: vi.fn(),
  setUserMock: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileMock(fd),
}));

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: vi.fn(),
  phoneVerifyOtpAction: vi.fn(),
  phoneChangeCodeAction: () => changeCodeMock(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, setUser: setUserMock }),
}));

const ANCIEN = '+221770009402';
const NOUVEAU = '+221770009403';

const VERIFIE: User = {
  id: 1,
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: ANCIEN,
  bio: null,
  avatar_url: null,
  email_verified_at: '2026-04-01T00:00:00Z',
  phone_verified_at: '2026-04-02T00:00:00Z',
  two_factor_enabled: false,
  agency_id: null,
  roles: ['customer'],
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
  has_usable_password: true,
};

beforeEach(() => {
  updateProfileMock.mockReset();
  changeCodeMock.mockReset();
  setUserMock.mockReset();
  updateProfileMock.mockResolvedValue({ ok: true, user: { ...VERIFIE, phone: NOUVEAU, phone_verified_at: null } });
  changeCodeMock.mockResolvedValue({ ok: true, data: { sent: true } });
});

async function saisirNouveauNumero(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByTestId('phone-input');
  await user.clear(input);
  await user.type(input, NOUVEAU);
}

describe('<ProfileContactSection> — preuve du remplacement d’un numéro vérifié', () => {
  it('demande une preuve et n’enregistre pas sans elle', async () => {
    const user = userEvent.setup();
    render(withIntl(<ProfileContactSection user={VERIFIE} />));
    await saisirNouveauNumero(user);

    expect(screen.getByTestId('phone-change-proof')).toBeInTheDocument();
    expect(screen.getByTestId('contact-save')).toBeDisabled();
  });

  it('transmet le mot de passe actuel avec le nouveau numéro', async () => {
    const user = userEvent.setup();
    render(withIntl(<ProfileContactSection user={VERIFIE} />));
    await saisirNouveauNumero(user);

    await user.type(screen.getByTestId('phone-change-password'), 'bon-mot-de-passe');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));
    const fd = updateProfileMock.mock.calls[0][0] as FormData;
    expect(fd.get('phone')).toBe(NOUVEAU);
    expect(fd.get('current_password')).toBe('bon-mot-de-passe');
    expect(fd.has('phone_change_code')).toBe(false);
  });

  it('envoie un code à l’ancien numéro et le transmet', async () => {
    const user = userEvent.setup();
    render(withIntl(<ProfileContactSection user={{ ...VERIFIE, has_usable_password: false }} />));
    await saisirNouveauNumero(user);

    // Sans mot de passe utilisable, le code est la seule preuve offerte.
    expect(screen.queryByTestId('phone-change-password')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('phone-change-send-code'));
    await waitFor(() => expect(changeCodeMock).toHaveBeenCalledTimes(1));

    await user.type(await screen.findByTestId('phone-change-code'), '123456');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));
    const fd = updateProfileMock.mock.calls[0][0] as FormData;
    expect(fd.get('phone_change_code')).toBe('123456');
    expect(fd.has('current_password')).toBe(false);
  });

  it('ne demande rien pour un numéro non vérifié', async () => {
    const user = userEvent.setup();
    render(withIntl(<ProfileContactSection user={{ ...VERIFIE, phone_verified_at: null }} />));
    await saisirNouveauNumero(user);

    expect(screen.queryByTestId('phone-change-proof')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('contact-save'));
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));
    const fd = updateProfileMock.mock.calls[0][0] as FormData;
    expect(fd.has('current_password')).toBe(false);
    expect(fd.has('phone_change_code')).toBe(false);
  });
});
