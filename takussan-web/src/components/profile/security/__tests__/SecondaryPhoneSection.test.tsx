import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { SecondaryPhoneSection } from '../SecondaryPhoneSection';

const m = vi.hoisted(() => ({
  envoyer: vi.fn(),
  verifier: vi.fn(),
  retirer: vi.fn(),
  setUser: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/secondary-phone', () => ({
  secondaryPhoneSendOtpAction: (p: string) => m.envoyer(p),
  secondaryPhoneVerifyAction: (p: string, c: string, w: boolean) => m.verifier(p, c, w),
  secondaryPhoneRemoveAction: () => m.retirer(),
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.courant.user, setUser: m.setUser, refreshUser: vi.fn() }),
}));

const VERIFIE: Partial<User> = { id: 1, phone: '+221770000601', phone_verified_at: '2026-10-01T00:00:00Z', secondary_phone: null, secondary_phone_verified_at: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.courant.user = VERIFIE;
});

describe('<SecondaryPhoneSection> — TCK-633', () => {
  it('rien tant que le numéro principal n’est pas vérifié', () => {
    m.courant.user = { ...VERIFIE, phone_verified_at: null };
    const { container } = render(withIntl(<SecondaryPhoneSection />));
    expect(container).toBeEmptyDOMElement();
  });

  it('ajoute un second numéro : code, puis vérification avec WhatsApp', async () => {
    m.envoyer.mockResolvedValue({ ok: true, codeApercu: null });
    const misAJour = { ...VERIFIE, secondary_phone: '+221770000602', secondary_phone_verified_at: '2026-10-12T00:00:00Z', secondary_phone_whatsapp: true };
    m.verifier.mockResolvedValue({ ok: true, user: misAJour });
    const user = userEvent.setup();
    render(withIntl(<SecondaryPhoneSection />));

    fireEvent.change(screen.getByTestId('secondary-phone-input'), { target: { value: '770000602' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));
    await user.click(screen.getByTestId('secondary-phone-send'));
    await waitFor(() => expect(m.envoyer).toHaveBeenCalledWith('+221770000602'));

    await user.type(await screen.findByTestId('secondary-phone-code'), '123456');
    await user.click(screen.getByTestId('secondary-phone-verify'));

    await waitFor(() => expect(m.setUser).toHaveBeenCalledWith(misAJour));
    expect(m.verifier).toHaveBeenCalledWith('+221770000602', '123456', true);
  });

  it('un second numéro vérifié se retire', async () => {
    m.courant.user = { ...VERIFIE, secondary_phone: '+221770000602', secondary_phone_verified_at: '2026-10-12T00:00:00Z' };
    m.retirer.mockResolvedValue({ ok: true, user: VERIFIE });
    const user = userEvent.setup();
    render(withIntl(<SecondaryPhoneSection />));

    expect(screen.getByTestId('secondary-phone-value')).toHaveTextContent('+221770000602');
    await user.click(screen.getByTestId('secondary-phone-remove'));

    await waitFor(() => expect(m.setUser).toHaveBeenCalledWith(VERIFIE));
  });

  it('un refus de l’API se dit', async () => {
    m.envoyer.mockResolvedValue({ ok: false, message: 'Ce numéro est déjà votre numéro principal.' });
    const user = userEvent.setup();
    render(withIntl(<SecondaryPhoneSection />));

    fireEvent.change(screen.getByTestId('secondary-phone-input'), { target: { value: '770000601' } });
    await user.click(screen.getByTestId('secondary-phone-send'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce numéro est déjà votre numéro principal.');
  });
});
