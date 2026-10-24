/**
 * TCK-2160 (P202.02) — activer ou couper le second facteur au profil met le contexte à jour.
 *
 * `TwoFactorSection` ne posait que son état local : le contexte gardait l'ancien
 * `two_factor_enabled`, que lit le dialogue de suppression du compte. Après activation, la demande
 * partait sans le code que l'API exige ; après coupure, le dialogue exigeait un code inutile.
 *
 * Décision du porteur (2026-10-24) : `refreshUser()` à la confirmation et à la coupure du second
 * facteur, comme P202.04 (TCK-2042) ; l'API reste juge du code.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

const { enableMock, confirmMock, disableMock } = vi.hoisted(() => ({
  enableMock: vi.fn(),
  confirmMock: vi.fn(),
  disableMock: vi.fn(),
}));

vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: () => enableMock(),
  twoFactorConfirmAction: (code: string) => confirmMock(code),
  twoFactorDisableAction: (payload: { password?: string }) => disableMock(payload),
  twoFactorRegenerateAction: vi.fn(),
}));

vi.mock('@/app/actions/account-deletion', () => ({
  getAccountDeletionRequestAction: async () => ({ ok: true, data: null }),
  cancelAccountDeletionAction: vi.fn(),
  requestAccountDeletionAction: vi.fn(),
  sendAccountDeletionStepUpCodeAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/queries/favorites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/favorites')>()),
  fetchAllFavoritePropertyIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('../security/PhoneVerificationSection', () => ({ PhoneVerificationSection: () => null }));
vi.mock('../security/ActiveSessionsSection', () => ({ ActiveSessionsSection: () => null }));

const { AuthProvider } = await import('@/context/AuthContext');
const { ProfileSecuritySection } = await import('../ProfileSecuritySection');

const COMPTE: User = {
  id: 1,
  first_name: 'Jane',
  last_name: 'Doe',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  bio: null,
  avatar_url: null,
  email_verified_at: '2026-04-01T00:00:00Z',
  phone_verified_at: null,
  two_factor_enabled: false,
  has_usable_password: true,
  agency_id: null,
  roles: ['customer'],
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
};

/** Ce que rend `/api/auth/me` : l'état du serveur après le geste. */
let compteServeur: User;

beforeEach(() => {
  enableMock.mockReset();
  confirmMock.mockReset();
  disableMock.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      if (String(entree) === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => compteServeur };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    }),
  );
});

function monter(compte: User) {
  compteServeur = compte;
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider initialUser={compte} initialToken="jeton">
          <ProfileSecuritySection />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Ouvre le dialogue de suppression jusqu'à l'étape de la preuve. */
async function ouvrirSuppression(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Supprimer mon compte' }));
  await user.click(screen.getByLabelText('Préoccupations de vie privée'));
  await user.click(screen.getByRole('button', { name: 'Continuer' }));
}

describe('second facteur et contexte (TCK-2160, P202.02)', () => {
  it('après activation, le dialogue de suppression demande le code du second facteur', async () => {
    const user = userEvent.setup();
    enableMock.mockResolvedValue({ ok: true, data: { secret: 'SECRET', qr_url: 'otpauth://totp/x' } });
    confirmMock.mockImplementation(async () => {
      compteServeur = { ...COMPTE, two_factor_enabled: true };
      return { ok: true, data: { enabled: true, recovery_codes: ['AAAAA-BBBBB'] } };
    });
    monter(COMPTE);

    await user.click(screen.getByRole('button', { name: /activer la 2fa/i }));
    await user.type(await screen.findByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: /confirmer et activer/i }));
    await screen.findByText('AAAAA-BBBBB');

    await ouvrirSuppression(user);
    await waitFor(() => expect(screen.getByLabelText('Code 2FA (6 chiffres)')).toBeInTheDocument());
  });

  it('après coupure, le dialogue de suppression ne demande plus de code', async () => {
    const user = userEvent.setup();
    disableMock.mockImplementation(async () => {
      compteServeur = { ...COMPTE, two_factor_enabled: false };
      return { ok: true, data: null };
    });
    monter({ ...COMPTE, two_factor_enabled: true });

    await user.click(screen.getByRole('button', { name: /désactiver la 2fa/i }));
    await user.type(screen.getByPlaceholderText('Mot de passe'), 'secret123');
    await user.click(screen.getByRole('button', { name: /confirmer la désactivation/i }));
    await waitFor(() => expect(disableMock).toHaveBeenCalledTimes(1));

    await ouvrirSuppression(user);
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.queryByLabelText('Code 2FA (6 chiffres)')).not.toBeInTheDocument());
  });
});
