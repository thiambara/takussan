import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import type { PendingAgencyInvitation } from '@/lib/queries/agency-invitations';
import { withIntl } from '@/test/intl';

import { LesInvitations } from '../LesInvitations';

/**
 * TCK-2928 (maquette `app-equipe`, a, e3) — « Par WhatsApp » à gauche d'« Envoyer l'invitation » dans
 * la barre du bas (téléphone), « Lien par WhatsApp » à côté sous le formulaire (bureau), seulement
 * quand la connexion par numéro est ouverte. « Repartager » d'une invitation d'équipe adressée au seul
 * numéro : un lien neuf (`share-link`), ouvert dans WhatsApp.
 */
const AGENCE = 12;

let drapeau = true;
vi.mock('@/components/auth/useConnexionParTelephone', () => ({ useConnexionParTelephone: () => drapeau }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }) }));
// Le formulaire est doublé ; son `envoi` (le pied du bureau) est rendu tel que l'écran le donne.
vi.mock('../FormulaireDInvitation', () => ({
  FormulaireDInvitation: ({ envoi }: { envoi?: (enCours: boolean) => ReactNode }) => <div data-testid="formulaire">{envoi?.(false)}</div>,
}));

const fetchPendingAgencyInvitations = vi.fn();
const partagerLeLienDeLInvitation = vi.fn();
vi.mock('@/lib/queries/agency-invitations', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agency-invitations')>()),
  fetchPendingAgencyInvitations: (...a: unknown[]) => fetchPendingAgencyInvitations(...a),
  partagerLeLienDeLInvitation: (...a: unknown[]) => partagerLeLienDeLInvitation(...a),
}));

const invitation = (id: number, e: Partial<PendingAgencyInvitation> = {}): PendingAgencyInvitation => ({
  id,
  email: null,
  phone: '+221771234567',
  role: 'agent',
  status: 'sent',
  agency_id: AGENCE,
  invitable_type: null,
  invitable_id: null,
  expires_at: '2026-11-14T10:00:00Z',
  created_at: '2026-11-07T10:00:00Z',
  is_expired: false,
  ...e,
});
const page = (data: PendingAgencyInvitation[]) => ({ data, meta: { total: data.length, current_page: 1, last_page: 1, per_page: 10 } });

function monter(telephone: boolean) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <LesInvitations agencyId={AGENCE} peutGerer peutInviter telephone={telephone} />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

let onglet: { opener: unknown; closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
let ouvrir: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  drapeau = true;
  fetchPendingAgencyInvitations
    .mockReset()
    .mockImplementation(async (_t: string, p: { statut: string }) =>
      p.statut === 'sent' ? page([invitation(1), invitation(2, { email: 'awa@exemple.sn', phone: null })]) : page([]),
    );
  partagerLeLienDeLInvitation.mockReset().mockResolvedValue({ id: 1, phone: '+221771234567', share_url: 'https://takussan.test/invitations/accept?token=neuf' });
  onglet = { opener: window, closed: false, location: { href: '' }, close: vi.fn() };
  ouvrir = vi.spyOn(window, 'open').mockReturnValue(onglet as unknown as Window);
});

afterEach(() => ouvrir.mockRestore());

describe('LesInvitations — WhatsApp', () => {
  it('AC5 — au téléphone, « Par WhatsApp » dans la barre du bas, avant « Envoyer l’invitation »', async () => {
    monter(true);
    await screen.findByTestId('invitation-en-cours-1');
    const envoyer = screen.getByRole('button', { name: 'Envoyer l’invitation' });
    const barre = envoyer.closest('[data-slot="barre-d-action"]') as HTMLElement;
    const boutons = within(barre).getAllByRole('button');
    expect(boutons.map((b) => b.textContent)).toEqual(['Par WhatsApp', 'Envoyer l’invitation']);
    expect(screen.queryByRole('button', { name: 'Lien par WhatsApp' })).toBeNull();
  });

  it('AC5 — au bureau, « Lien par WhatsApp » ; drapeau `phone_login` éteint : aucun des deux', async () => {
    const { unmount } = monter(false);
    await screen.findByTestId('invitation-en-cours-1');
    const pied = within(screen.getByTestId('formulaire')).getAllByRole('button');
    expect(pied.map((b) => b.textContent)).toEqual(['Lien par WhatsApp', 'Envoyer l’invitation']);
    expect(screen.queryByRole('button', { name: 'Par WhatsApp' })).toBeNull();
    unmount();

    drapeau = false;
    const deux = monter(true);
    await screen.findByTestId('invitation-en-cours-1');
    expect(screen.queryByRole('button', { name: 'Par WhatsApp' })).toBeNull();
    deux.unmount();
    monter(false);
    await screen.findByTestId('invitation-en-cours-1');
    expect(screen.queryByRole('button', { name: 'Lien par WhatsApp' })).toBeNull();
  });

  it('« Repartager » sur une invitation au seul numéro : un lien neuf, ouvert dans wa.me ; pas sur une invitation par e-mail', async () => {
    const user = userEvent.setup();
    monter(false);
    const ligne = await screen.findByTestId('invitation-en-cours-1');
    expect(within(screen.getByTestId('invitation-en-cours-2')).queryByRole('button', { name: /Repartager/ })).toBeNull();

    await user.click(within(ligne).getByRole('button', { name: /Repartager par WhatsApp l’invitation de/ }));
    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(partagerLeLienDeLInvitation).toHaveBeenCalledWith('jeton', 1);
    await waitFor(() => expect(onglet.location.href).toMatch(/^https:\/\/wa\.me\/221771234567\?text=/));
    expect(decodeURIComponent(onglet.location.href)).toContain('token=neuf');
    expect(await screen.findByText(/Nouveau lien créé pour/)).toBeInTheDocument();
  });

  it('un échec du renouvellement referme l’onglet', async () => {
    partagerLeLienDeLInvitation.mockRejectedValueOnce(new Error('panne'));
    const user = userEvent.setup();
    monter(false);
    const ligne = await screen.findByTestId('invitation-en-cours-1');
    await user.click(within(ligne).getByRole('button', { name: /Repartager/ }));
    await waitFor(() => expect(onglet.close).toHaveBeenCalled());
    expect(onglet.location.href).toBe('');
  });
});
