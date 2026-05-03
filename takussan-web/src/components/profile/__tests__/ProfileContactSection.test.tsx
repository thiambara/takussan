import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileContactSection } from '../ProfileContactSection';
import type { User } from '@/types/user';

const { updateProfileMock, sendOtpMock, verifyOtpMock, setUserMock, currentUser } =
  vi.hoisted(() => ({
    updateProfileMock: vi.fn(),
    sendOtpMock: vi.fn(),
    verifyOtpMock: vi.fn(),
    setUserMock: vi.fn(),
    currentUser: { value: null as User | null },
  }));

vi.mock('@/app/actions/auth', () => ({
  updateProfileAction: (fd: FormData) => updateProfileMock(fd),
}));

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: () => sendOtpMock(),
  phoneVerifyOtpAction: (code: string) => verifyOtpMock(code),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: currentUser.value,
    token: 'test-token',
    isLoading: false,
    setUser: setUserMock,
    refreshUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const BASE_USER: User = {
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
  agency_id: null,
  roles: ['customer'],
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
};

beforeEach(() => {
  updateProfileMock.mockReset();
  sendOtpMock.mockReset();
  verifyOtpMock.mockReset();
  setUserMock.mockReset();
  currentUser.value = BASE_USER;
});

describe('<ProfileContactSection>', () => {
  it('does not render the legacy "Bientôt disponible" placeholder', () => {
    render(<ProfileContactSection user={BASE_USER} />);
    expect(screen.queryByText(/bientôt disponible/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('phone-input')).not.toBeDisabled();
  });

  it('shows a live error for non-E.164 input', async () => {
    const user = userEvent.setup();
    render(<ProfileContactSection user={BASE_USER} />);
    const input = screen.getByTestId('phone-input');
    await user.type(input, '0770000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(/E\.164/);
    expect(screen.getByTestId('contact-save')).toBeDisabled();
  });

  it('saves a valid phone via updateProfileAction with the phone field', async () => {
    const user = userEvent.setup();
    updateProfileMock.mockResolvedValue({
      ok: true,
      user: { ...BASE_USER, phone: '+221770000000', phone_verified_at: null },
    });

    render(<ProfileContactSection user={BASE_USER} />);
    await user.type(screen.getByTestId('phone-input'), '+221770000000');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/enregistrées/i),
    );

    const fd = updateProfileMock.mock.calls[0][0] as FormData;
    expect(fd.get('phone')).toBe('+221770000000');
  });

  it('flips the badge to "Non vérifié" after a successful save resets phone_verified_at', async () => {
    const user = userEvent.setup();
    const verifiedUser: User = {
      ...BASE_USER,
      phone: '+221770000000',
      phone_verified_at: '2026-04-10T00:00:00Z',
    };
    updateProfileMock.mockResolvedValue({
      ok: true,
      user: { ...verifiedUser, phone: '+221780000000', phone_verified_at: null },
    });

    render(<ProfileContactSection user={verifiedUser} />);
    expect(screen.getByTestId('phone-status-badge')).toHaveTextContent('Vérifié');

    const input = screen.getByTestId('phone-input');
    await user.clear(input);
    await user.type(input, '+221780000000');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() =>
      expect(screen.getByTestId('phone-status-badge')).toHaveTextContent('Non vérifié'),
    );
  });

  it('opens the OTP flow on "Vérifier" and confirms via phoneVerifyOtpAction', async () => {
    const user = userEvent.setup();
    sendOtpMock.mockResolvedValue({ ok: true, data: { sent: true, debug_code: '123456' } });
    verifyOtpMock.mockResolvedValue({ ok: true, data: null });

    render(
      <ProfileContactSection
        user={{ ...BASE_USER, phone: '+221770000000', phone_verified_at: null }}
      />,
    );
    await user.click(screen.getByTestId('phone-otp-send'));
    await waitFor(() =>
      expect(screen.getByTestId('phone-otp-code')).toBeInTheDocument(),
    );
    await user.type(screen.getByTestId('phone-otp-code'), '123456');
    await user.click(screen.getByTestId('phone-otp-verify'));

    await waitFor(() =>
      expect(screen.getByTestId('phone-status-badge')).toHaveTextContent('Vérifié'),
    );
    expect(verifyOtpMock).toHaveBeenCalledWith('123456');
  });

  it('syncs the auth context after a successful phone save', async () => {
    const user = userEvent.setup();
    const updated: User = { ...BASE_USER, phone: '+221770000000', phone_verified_at: null };
    updateProfileMock.mockResolvedValue({ ok: true, user: updated });

    render(<ProfileContactSection user={BASE_USER} />);
    await user.type(screen.getByTestId('phone-input'), '+221770000000');
    await user.click(screen.getByTestId('contact-save'));

    await waitFor(() => expect(setUserMock).toHaveBeenCalled());
    const call = setUserMock.mock.calls.at(-1);
    expect(call?.[0]).toMatchObject({
      phone: '+221770000000',
      phone_verified_at: null,
    });
  });

  it('syncs the auth context after a successful OTP verification', async () => {
    const user = userEvent.setup();
    sendOtpMock.mockResolvedValue({ ok: true, data: { sent: true, debug_code: '123456' } });
    verifyOtpMock.mockResolvedValue({ ok: true, data: null });

    render(
      <ProfileContactSection
        user={{ ...BASE_USER, phone: '+221770000000', phone_verified_at: null }}
      />,
    );
    await user.click(screen.getByTestId('phone-otp-send'));
    await waitFor(() => screen.getByTestId('phone-otp-code'));
    await user.type(screen.getByTestId('phone-otp-code'), '123456');
    await user.click(screen.getByTestId('phone-otp-verify'));

    await waitFor(() => expect(setUserMock).toHaveBeenCalled());
    const call = setUserMock.mock.calls.at(-1);
    expect(call?.[0]?.phone_verified_at).toBeTruthy();
  });

  it('hides the verify block while a fresh phone edit is unsaved', async () => {
    const user = userEvent.setup();
    render(
      <ProfileContactSection
        user={{ ...BASE_USER, phone: '+221770000000', phone_verified_at: null }}
      />,
    );
    expect(screen.getByTestId('phone-verify-block')).toBeInTheDocument();

    const input = screen.getByTestId('phone-input');
    await user.clear(input);
    await user.type(input, '+221780000000');
    expect(screen.queryByTestId('phone-verify-block')).not.toBeInTheDocument();
  });
});
