import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { TotpEnrollment } from '../TotpEnrollment';

// Server actions are mocked: TotpEnrollment delegates to them but we want
// deterministic, no-network behaviour in unit tests.
vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: vi.fn(),
  twoFactorConfirmAction: vi.fn(),
}));

import {
  twoFactorConfirmAction,
  twoFactorEnableAction,
} from '@/app/actions/security';

const messages = {
  auth: {
    twoFactor: {
      intro: {
        title: 'Renforcez la sécurité',
        description: 'Activez la 2FA pour protéger votre compte.',
        cta: 'Configurer maintenant',
        starting: 'Initialisation…',
        skip: 'Plus tard',
      },
      scan: {
        title: 'Scannez le QR code',
        description: 'Avec votre application TOTP.',
        manualHint: 'Ou saisissez la clé manuellement :',
        codeLabel: 'Code à 6 chiffres',
        cta: 'Vérifier',
        verifying: 'Vérification…',
        qrAlt: 'QR code',
      },
      success: {
        title: 'Activée',
        description: 'La 2FA est désormais active.',
        cta: 'Continuer',
      },
      recovery: {
        title: 'Codes de récupération',
        warning: 'Notez-les maintenant.',
        download: 'Télécharger',
        ack: "J'ai sauvegardé mes codes",
        fileHeader: 'Codes de récupération Takussan',
        fileFooter: 'Conservez-les en lieu sûr.',
      },
    },
  },
};

function renderWithProvider(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe('<TotpEnrollment>', () => {
  it('lets the user skip in recommended mode without calling the API', async () => {
    const onSkip = vi.fn();
    const onComplete = vi.fn();

    renderWithProvider(
      <TotpEnrollment mode="recommended" onComplete={onComplete} onSkip={onSkip} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /plus tard/i }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(twoFactorEnableAction).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('walks through enroll → confirm → ack to call onComplete', async () => {
    vi.mocked(twoFactorEnableAction).mockResolvedValue({
      ok: true,
      data: { secret: 'JBSWY3DPEHPK3PXP', qr_url: 'otpauth://totp/test', qr_svg: 'data:image/svg+xml;base64,xxx' },
    });
    vi.mocked(twoFactorConfirmAction).mockResolvedValue({
      ok: true,
      data: { enabled: true, recovery_codes: ['code-1', 'code-2', 'code-3'] },
    });

    const onComplete = vi.fn();

    renderWithProvider(
      <TotpEnrollment mode="recommended" onComplete={onComplete} onSkip={() => {}} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /configurer/i }));

    await waitFor(() => {
      expect(screen.getByText(/scannez le qr code/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/code à 6 chiffres/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /vérifier/i }));

    await waitFor(() => {
      expect(screen.getByText(/codes de récupération/i)).toBeInTheDocument();
    });

    // The "Continuer" button stays disabled until the user ticks the ack box.
    const continueBtn = screen.getByRole('button', { name: /continuer/i });
    expect(continueBtn).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(continueBtn).toBeEnabled();

    await userEvent.click(continueBtn);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
