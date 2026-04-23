import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneVerificationSection } from '../security/PhoneVerificationSection';

const sendMock = vi.fn();
const verifyMock = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: () => sendMock(),
  phoneVerifyOtpAction: (code: string) => verifyMock(code),
}));

describe('<PhoneVerificationSection>', () => {
  beforeEach(() => {
    sendMock.mockReset();
    verifyMock.mockReset();
  });

  it('tells users to fill in a phone when none is on file', () => {
    render(<PhoneVerificationSection phone={null} phoneVerified={false} />);
    expect(
      screen.getByText(/ajoutez d'abord un numéro de téléphone/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /envoyer le code/i }),
    ).not.toBeInTheDocument();
  });

  it('sends an OTP and then reveals the verification form', async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue({ ok: true, data: { sent: true, debug_code: '999999' } });
    render(
      <PhoneVerificationSection phone="+221771234567" phoneVerified={false} />,
    );

    await user.click(screen.getByRole('button', { name: /envoyer le code/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/999999/),
    );
    expect(screen.getByLabelText(/code à 6 chiffres/i)).toBeInTheDocument();
  });

  it('flips the status badge after a successful verification', async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue({ ok: true, data: { sent: true, debug_code: '123456' } });
    verifyMock.mockResolvedValue({ ok: true, data: null });
    render(
      <PhoneVerificationSection phone="+221771234567" phoneVerified={false} />,
    );

    await user.click(screen.getByRole('button', { name: /envoyer le code/i }));
    await waitFor(() => screen.getByLabelText(/code à 6 chiffres/i));
    await user.type(screen.getByLabelText(/code à 6 chiffres/i), '123456');
    await user.click(screen.getByRole('button', { name: /vérifier$/i }));

    await waitFor(() => expect(screen.getByText('Vérifié')).toBeInTheDocument());
  });

  it('shows the 429 rate-limit error from the backend', async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue({
      ok: false,
      message: 'Please wait before requesting another code.',
    });
    render(
      <PhoneVerificationSection phone="+221771234567" phoneVerified={false} />,
    );
    await user.click(screen.getByRole('button', { name: /envoyer le code/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/please wait/i),
    );
  });
});
