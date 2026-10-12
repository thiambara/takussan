import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { CaseWhatsApp } from '../CaseWhatsApp';

const { majMock, setUserMock, courant } = vi.hoisted(() => ({
  majMock: vi.fn(),
  setUserMock: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (p: unknown) => majMock(p),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: courant.user, setUser: setUserMock, refreshUser: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  courant.user = { id: 1, phone_whatsapp: false };
});

describe('<CaseWhatsApp> — TCK-633', () => {
  it('cocher enregistre la case et met le compte à jour', async () => {
    majMock.mockResolvedValue({ ok: true, user: { id: 1, phone_whatsapp: true } });
    const user = userEvent.setup();
    render(withIntl(<CaseWhatsApp champ="phone_whatsapp" id="w" />));

    await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));

    await waitFor(() => expect(setUserMock).toHaveBeenCalledWith({ id: 1, phone_whatsapp: true }));
    expect(majMock).toHaveBeenCalledWith({ phone_whatsapp: true });
  });

  it('décocher envoie `false`, pas l’absence du champ', async () => {
    courant.user = { id: 1, phone_whatsapp: true };
    majMock.mockResolvedValue({ ok: true, user: { id: 1, phone_whatsapp: false } });
    const user = userEvent.setup();
    render(withIntl(<CaseWhatsApp champ="phone_whatsapp" id="w" />));

    const caseACocher = screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' });
    expect(caseACocher).toBeChecked();
    await user.click(caseACocher);

    await waitFor(() => expect(majMock).toHaveBeenCalledWith({ phone_whatsapp: false }));
  });

  it('un refus se dit', async () => {
    majMock.mockResolvedValue({ ok: false, message: 'Refusé.' });
    const user = userEvent.setup();
    render(withIntl(<CaseWhatsApp champ="secondary_phone_whatsapp" id="w2" />));

    await user.click(screen.getByRole('checkbox'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé.');
    expect(setUserMock).not.toHaveBeenCalled();
  });
});
