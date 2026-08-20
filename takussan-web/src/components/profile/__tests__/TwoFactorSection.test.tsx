import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TwoFactorSection } from '../security/TwoFactorSection';
import { withIntl } from '@/test/intl';

// ─── Mocks ────────────────────────────────────────────────────────────────────
const enableMock = vi.fn();
const confirmMock = vi.fn();
const disableMock = vi.fn();
const regenMock = vi.fn();

vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: () => enableMock(),
  twoFactorConfirmAction: (code: string) => confirmMock(code),
  twoFactorDisableAction: (payload: { password?: string; code?: string }) =>
    disableMock(payload),
  twoFactorRegenerateAction: () => regenMock(),
}));

describe('<TwoFactorSection>', () => {
  beforeEach(() => {
    enableMock.mockReset();
    confirmMock.mockReset();
    disableMock.mockReset();
    regenMock.mockReset();
  });

  it('shows the enable CTA when 2FA is disabled', () => {
    render(withIntl(<TwoFactorSection enabled={false} />));
    expect(screen.getByText('Désactivée')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /activer la 2fa/i }),
    ).toBeInTheDocument();
  });

  it('renders the setup block (secret + 6-digit code input) after enable', async () => {
    const user = userEvent.setup();
    enableMock.mockResolvedValue({
      ok: true,
      data: { secret: 'ABCDEFGH', qr_url: 'otpauth://totp/x' },
    });
    render(withIntl(<TwoFactorSection enabled={false} />));

    await user.click(screen.getByRole('button', { name: /activer la 2fa/i }));

    await waitFor(() => expect(screen.getByText('ABCDEFGH')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
  });

  it('on successful confirm, surfaces the recovery codes', async () => {
    const user = userEvent.setup();
    enableMock.mockResolvedValue({
      ok: true,
      data: { secret: 'SECRET_KEY', qr_url: 'otpauth://totp/x' },
    });
    confirmMock.mockResolvedValue({
      ok: true,
      data: { enabled: true, recovery_codes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] },
    });
    render(withIntl(<TwoFactorSection enabled={false} />));

    await user.click(screen.getByRole('button', { name: /activer la 2fa/i }));
    await waitFor(() => screen.getByPlaceholderText('123456'));
    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: /confirmer et activer/i }));

    await waitFor(() => {
      expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument();
      expect(screen.getByText('CCCCC-DDDDD')).toBeInTheDocument();
    });
  });

  it('renders the disable flow when 2FA is already enabled', async () => {
    const user = userEvent.setup();
    disableMock.mockResolvedValue({ ok: true, data: null });
    render(withIntl(<TwoFactorSection enabled={true} />));

    expect(screen.getByText('Activée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /désactiver la 2fa/i }));
    expect(screen.getByPlaceholderText('Mot de passe')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Mot de passe'), 'secret123');
    await user.click(
      screen.getByRole('button', { name: /confirmer la désactivation/i }),
    );

    await waitFor(() =>
      expect(disableMock).toHaveBeenCalledWith({ password: 'secret123' }),
    );
  });

  it('surfaces error messages returned from the server action', async () => {
    const user = userEvent.setup();
    enableMock.mockResolvedValue({ ok: false, message: 'Boom.' });
    render(withIntl(<TwoFactorSection enabled={false} />));

    await user.click(screen.getByRole('button', { name: /activer la 2fa/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom.'));
  });
});
