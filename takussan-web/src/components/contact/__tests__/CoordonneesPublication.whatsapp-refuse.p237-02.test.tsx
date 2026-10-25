/**
 * P237.02 (TCK-2361) — `verifierCode` vérifie le code, puis enregistre la case WhatsApp. Un refus de
 * cette seconde requête ne laissait qu'un « Numéro vérifié. » : la réponse cochée était perdue sans
 * un mot, et la question oui/non revenait. Le refus se dit désormais avec le message de l'action,
 * comme le fait la réponse directe à la question (`repondreWhatsApp`), et « Numéro vérifié. » reste
 * dit pour la vérification, qui a bien réussi.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { CoordonneesPublication } from '../CoordonneesPublication';

const m = vi.hoisted(() => ({
  maj: vi.fn(),
  envoyer: vi.fn(),
  verifier: vi.fn(),
  setUser: vi.fn(),
  refreshUser: vi.fn(),
  courant: { user: null as Partial<User> | null },
}));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: (p: unknown) => m.maj(p) }));
vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (p?: string) => m.envoyer(p),
  phoneVerifyOtpAction: (c: string) => m.verifier(c),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: m.courant.user, setUser: m.setUser, refreshUser: m.refreshUser }),
}));

const SANS_NUMERO: Partial<User> = {
  id: 1, first_name: 'Awa', last_name: 'Diop', phone: null, phone_verified_at: null,
  terms_accepted_at: '2026-10-01T00:00:00Z',
};

async function verifierAvecWhatsApp() {
  const user = userEvent.setup();
  render(withIntl(<CoordonneesPublication manquantsServeur={null} contactEstSoi />));
  fireEvent.change(screen.getByLabelText('Votre numéro'), { target: { value: '770000901' } });
  await user.click(screen.getByRole('checkbox', { name: 'Ce numéro reçoit WhatsApp' }));
  await user.click(screen.getByRole('button', { name: 'Recevoir un code' }));
  await user.type(await screen.findByLabelText('Code reçu par SMS'), '123456');
  await user.click(screen.getByRole('button', { name: 'Valider' }));
  await waitFor(() => expect(m.refreshUser).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  m.courant.user = SANS_NUMERO;
  m.refreshUser.mockResolvedValue(undefined);
  m.envoyer.mockResolvedValue({ ok: true, data: { sent: true, codeApercu: null } });
  m.verifier.mockResolvedValue({ ok: true, data: null });
});

describe('<CoordonneesPublication> — la case WhatsApp refusée après un code accepté (P237.02)', () => {
  it('le refus se dit avec le message de l’action, et « Numéro vérifié. » reste', async () => {
    m.maj.mockResolvedValue({ ok: false, message: 'REFUS-WHATSAPP' });

    await verifierAvecWhatsApp();

    expect(m.maj).toHaveBeenCalledWith({ phone_whatsapp: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('REFUS-WHATSAPP');
    expect(screen.getByRole('status')).toHaveTextContent('Numéro vérifié.');
    expect(m.setUser).not.toHaveBeenCalled();
  });

  it('la case acceptée : « Numéro vérifié. », et aucune alerte', async () => {
    m.maj.mockResolvedValue({ ok: true, user: { ...SANS_NUMERO, phone_whatsapp: true } });

    await verifierAvecWhatsApp();

    expect(await screen.findByRole('status')).toHaveTextContent('Numéro vérifié.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
