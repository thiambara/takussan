/**
 * TCK-2040 (P202.03) — le numéro vérifié dans « Sécurité » l'est pour toute l'application.
 *
 * Mesuré le 2026-10-24 : la section ne posait que son état local ; le contexte gardait
 * `phone_verified_at: null`, si bien que l'ajout du second numéro restait caché et que
 * « Coordonnées » disait toujours « Non vérifié ». Dans l'autre sens, un numéro changé dans
 * « Coordonnées » laissait « Sécurité » dire « Vérifié ».
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

const { sendMock, verifyMock, updateProfileMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  verifyMock: vi.fn(),
  updateProfileMock: vi.fn(),
}));

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: () => sendMock(),
  phoneVerifyOtpAction: (code: string) => verifyMock(code),
}));

vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileMock(fd),
}));

vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: vi.fn().mockResolvedValue([]),
}));

const { AuthProvider } = await import('@/context/AuthContext');
const { ProfileSecuritySection } = await import('../ProfileSecuritySection');
const { ProfileContactSection } = await import('../ProfileContactSection');

vi.mock('../security/TwoFactorSection', () => ({ TwoFactorSection: () => null }));
vi.mock('../security/ActiveSessionsSection', () => ({ ActiveSessionsSection: () => null }));
vi.mock('../security/AccountDeletionSection', () => ({ AccountDeletionSection: () => null }));

const COMPTE: User = {
  id: 1,
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+221771234567',
  bio: null,
  avatar_url: null,
  email_verified_at: '2026-04-01T00:00:00Z',
  phone_verified_at: null,
  two_factor_enabled: false,
  agency_id: null,
  roles: ['customer'],
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
};

function monter(compte: User) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider initialUser={compte} initialToken="jeton">
          <div data-testid="coordonnees">
            <ProfileContactSection user={compte} />
          </div>
          <div data-testid="securite">
            <ProfileSecuritySection />
          </div>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Le bloc « Vérification du téléphone » de « Sécurité » : l'adresse a son propre badge. */
const blocTelephone = () =>
  within(screen.getByText('Vérification du téléphone').closest('div.rounded-2xl') as HTMLElement);

beforeEach(() => {
  sendMock.mockReset();
  verifyMock.mockReset();
  updateProfileMock.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

describe('PhoneVerificationSection dans le contexte (TCK-2040, P202.03)', () => {
  it('une vérification par « Sécurité » ouvre le second numéro et passe « Coordonnées » à vérifié', async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue({ ok: true, data: { sent: true } });
    verifyMock.mockResolvedValue({ ok: true, data: null });
    monter(COMPTE);

    expect(screen.queryByText(/second numéro/i)).not.toBeInTheDocument();
    const securite = blocTelephone();
    await user.click(securite.getByRole('button', { name: /envoyer le code/i }));
    await waitFor(() => securite.getByLabelText(/code à 6 chiffres/i));
    await user.type(securite.getByLabelText(/code à 6 chiffres/i), '123456');
    await user.click(securite.getByRole('button', { name: /vérifier$/i }));

    await waitFor(() => expect(securite.getByText('Vérifié')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('phone-status-badge')).toHaveTextContent('Vérifié'));
    expect(screen.getByTestId('phone-status-badge')).not.toHaveTextContent('Non vérifié');
    expect(screen.getByText(/second numéro/i)).toBeInTheDocument();
  });

  it('un numéro changé dans « Coordonnées » repasse « Sécurité » à non vérifié', async () => {
    const user = userEvent.setup();
    const verifie: User = { ...COMPTE, phone_verified_at: '2026-04-01T00:00:00Z', has_usable_password: true };
    const nouveau = '+221770009403';
    updateProfileMock.mockResolvedValue({ ok: true, user: { ...verifie, phone: nouveau, phone_verified_at: null } });
    monter(verifie);

    const securite = blocTelephone();
    expect(securite.getByText('Vérifié')).toBeInTheDocument();
    const champ = screen.getByTestId('phone-input');
    await user.clear(champ);
    await user.type(champ, nouveau);
    await user.type(screen.getByTestId('phone-change-password'), 'bon-mot-de-passe');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(securite.getByText('Non vérifié')).toBeInTheDocument());
  });
});
