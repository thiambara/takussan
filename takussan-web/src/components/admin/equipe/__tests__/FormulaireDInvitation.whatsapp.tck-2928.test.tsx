import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { useCan } from '@/hooks/useCan';
import { ApiError } from '@/lib/api';
import { inviteAgencyAgent } from '@/lib/queries/agency-invitations';
import { withIntl } from '@/test/intl';

import { FormulaireDInvitation, type PoigneeDInvitation } from '../FormulaireDInvitation';

/**
 * TCK-2928 (ADR-0123) — « Par WhatsApp » : le formulaire part avec `delivery: "share"` et sans e-mail
 * (aucun message n'est envoyé), puis l'onglet ouvert dans le geste part vers `wa.me/<numéro>` avec le
 * `share_url` rendu une fois. Une saisie refusée n'ouvre aucun onglet et ne part pas au réseau ; un échec
 * referme l'onglet. Le lien n'est écrit dans aucun stockage du navigateur.
 */
vi.mock('@/lib/queries/agency-invitations', () => ({ inviteAgencyAgent: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton-de-test' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

const LIEN = 'https://takussan.test/invitations/accept?token=secret-123';

function Banc() {
  const poignee = useRef<PoigneeDInvitation>(null);
  return (
    <ToastProvider>
      <FormulaireDInvitation ref={poignee} id="inviter" agencyId={7} envoi={() => <Button type="submit">Envoyer l’invitation</Button>} />
      <Button type="button" onClick={() => poignee.current?.parWhatsApp()}>
        Par WhatsApp
      </Button>
      <Toaster />
    </ToastProvider>
  );
}

let onglet: { opener: unknown; closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
let ouvrir: ReturnType<typeof vi.spyOn>;
let ecritures: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCan).mockReturnValue({ can: false, isLoading: false });
  vi.mocked(inviteAgencyAgent).mockResolvedValue({ data: { id: 5, phone: '+221771234567', share_url: LIEN } } as never);
  onglet = { opener: window, closed: false, location: { href: '' }, close: vi.fn() };
  ouvrir = vi.spyOn(window, 'open').mockReturnValue(onglet as unknown as Window);
  ecritures = vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
  ouvrir.mockRestore();
  ecritures.mockRestore();
});

async function remplir(user: ReturnType<typeof userEvent.setup>, telephone = '77 123 45 67') {
  await user.type(screen.getByLabelText('Prénom'), 'Awa');
  await user.type(screen.getByLabelText('Nom'), 'Ndiaye');
  if (telephone) await user.type(screen.getByLabelText('Téléphone (facultatif)'), telephone);
}

describe('FormulaireDInvitation — par WhatsApp', () => {
  it('crée l’invitation en `delivery: share`, sans e-mail, et ouvre wa.me avec le lien rendu', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await remplir(user);
    await user.click(screen.getByRole('button', { name: 'Par WhatsApp' }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledTimes(1));
    const [agence, charge] = vi.mocked(inviteAgencyAgent).mock.calls[0];
    expect(agence).toBe(7);
    expect(charge).toEqual({ delivery: 'share', first_name: 'Awa', last_name: 'Ndiaye', role: 'agent', phone: '77 123 45 67' });
    expect(charge).not.toHaveProperty('email');

    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(onglet.opener).toBeNull();
    await waitFor(() => expect(onglet.location.href).toMatch(/^https:\/\/wa\.me\/221771234567\?text=/));
    expect(decodeURIComponent(onglet.location.href)).toContain(LIEN);
    expect(onglet.close).not.toHaveBeenCalled();
    expect(await screen.findByText(/Invitation créée pour le .*: envoyez le message dans WhatsApp\./)).toBeInTheDocument();
    // Le lien n'est gardé nulle part : ni stockage, ni page.
    expect(ecritures).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain('secret-123');
  });

  it('sans numéro, ou avec un e-mail, rien ne part et aucun onglet ne s’ouvre', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await remplir(user, '');
    await user.click(screen.getByRole('button', { name: 'Par WhatsApp' }));
    expect(await screen.findByText('Le numéro de téléphone est requis pour inviter par WhatsApp.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Téléphone (facultatif)'), '771234567');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'awa@exemple.sn');
    await user.click(screen.getByRole('button', { name: 'Par WhatsApp' }));
    expect(await screen.findByText(/laissez l’adresse e-mail vide/)).toBeInTheDocument();

    expect(inviteAgencyAgent).not.toHaveBeenCalled();
    expect(ouvrir).not.toHaveBeenCalled();
  });

  it('un refus de l’API referme l’onglet ouvert dans le geste', async () => {
    vi.mocked(inviteAgencyAgent).mockRejectedValueOnce(new ApiError(422, { message: 'Refus.', errors: { phone: ['Numéro injoignable.'] } }));
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await remplir(user);
    await user.click(screen.getByRole('button', { name: 'Par WhatsApp' }));

    await waitFor(() => expect(onglet.close).toHaveBeenCalled());
    expect(onglet.location.href).toBe('');
  });

  it('« Envoyer l’invitation » reste l’envoi par e-mail, sans `delivery`', async () => {
    const user = userEvent.setup();
    render(withIntl(<Banc />));
    await remplir(user, '');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'awa@exemple.sn');
    await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    await waitFor(() => expect(inviteAgencyAgent).toHaveBeenCalledTimes(1));
    expect(vi.mocked(inviteAgencyAgent).mock.calls[0][1]).not.toHaveProperty('delivery');
    expect(ouvrir).not.toHaveBeenCalled();
  });
});
