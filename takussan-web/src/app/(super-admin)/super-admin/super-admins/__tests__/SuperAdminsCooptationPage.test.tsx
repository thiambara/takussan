import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import {
  fetchSuperAdminListing,
  resendSuperAdminInvitation,
  revokeSuperAdminInvitation,
  type SuperAdminCooptationListing,
  type SuperAdminPendingInvitation,
} from '@/lib/queries/super-admin';
import SuperAdminsCooptationPage from '../page';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchSuperAdminListing: vi.fn(),
  inviteSuperAdmin: vi.fn(),
  resendSuperAdminInvitation: vi.fn(),
  revokeSuperAdminInvitation: vi.fn(),
}));

function invitation(overrides: Partial<SuperAdminPendingInvitation> = {}): SuperAdminPendingInvitation {
  return {
    id: 7,
    email: 'coopte@takussan.app',
    role: 'super_admin',
    status: 'sent',
    agency_id: null,
    invited_by: 1,
    expires_at: '2026-09-03T10:00:00+00:00',
    created_at: '2026-08-27T10:00:00+00:00',
    is_expired: false,
    metadata: null,
    ...overrides,
  };
}

function listing(overrides: Partial<SuperAdminCooptationListing> = {}): SuperAdminCooptationListing {
  return {
    super_admins: [
      {
        id: 1,
        first_name: 'Awa',
        last_name: 'Diop',
        email: 'awa@takussan.app',
        status: 'active',
        two_factor_enabled: true,
        force_2fa_at_first_login: false,
        last_login_at: '2026-08-25T08:30:00+00:00',
        created_at: '2026-01-01T00:00:00+00:00',
      },
    ],
    pending_invitations: [invitation()],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    withIntl(
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <SuperAdminsCooptationPage />
        </QueryClientProvider>
      </ToastProvider>,
    ),
  );
}

describe('<SuperAdminsCooptationPage> — TCK-367', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche la date d’expiration et la dernière connexion', async () => {
    vi.mocked(fetchSuperAdminListing).mockResolvedValue(listing());

    renderPage();

    // Expiration de l'invitation en attente.
    expect(await screen.findByText(/Expire le/)).toBeInTheDocument();
    // Dernière connexion de l'actif — l'écran ne la portait pas avant ce ticket.
    expect(screen.getByText(/Dernière connexion le/)).toBeInTheDocument();
  });

  it('affiche « Jamais connecté » quand last_login_at est nul', async () => {
    vi.mocked(fetchSuperAdminListing).mockResolvedValue(
      listing({
        super_admins: [
          {
            id: 1,
            first_name: 'Awa',
            last_name: 'Diop',
            email: 'awa@takussan.app',
            status: 'active',
            two_factor_enabled: false,
            force_2fa_at_first_login: true,
            last_login_at: null,
            created_at: null,
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('Jamais connecté')).toBeInTheDocument();
  });

  /**
   * AC3 — « expirée » et « en attente » sont deux ÉTATS. Le test vérifie la
   * pastille, pas la couleur : un rendu qui se contenterait de griser la
   * ligne cocherait un critère formulé sur l'apparence, pas sur l'état.
   */
  it('distingue une invitation expirée d’une invitation encore valable', async () => {
    vi.mocked(fetchSuperAdminListing).mockResolvedValue(
      listing({
        pending_invitations: [
          invitation({ id: 7, email: 'valide@takussan.app', is_expired: false }),
          invitation({
            id: 8,
            email: 'perimee@takussan.app',
            is_expired: true,
            expires_at: '2026-08-20T10:00:00+00:00',
          }),
        ],
      }),
    );

    renderPage();

    const valide = await screen.findByTestId('invitation-7');
    const perimee = screen.getByTestId('invitation-8');

    expect(within(valide).getByTestId('invitation-state')).toHaveTextContent('Invité');
    expect(within(perimee).getByTestId('invitation-state')).toHaveTextContent('Expirée');
    expect(within(perimee).getByText(/Expirée le/)).toBeInTheDocument();
    expect(within(valide).getByText(/Expire le/)).toBeInTheDocument();
  });

  it('relance une invitation via l’endpoint de relance, jamais via une nouvelle invitation', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSuperAdminListing).mockResolvedValue(listing());
    vi.mocked(resendSuperAdminInvitation).mockResolvedValue(invitation());

    renderPage();

    const ligne = await screen.findByTestId('invitation-7');
    await user.click(within(ligne).getByRole('button', { name: /Relancer/ }));

    await waitFor(() => {
      expect(resendSuperAdminInvitation).toHaveBeenCalledWith(7);
    });
    expect(revokeSuperAdminInvitation).not.toHaveBeenCalled();
  });

  it('annule une invitation après confirmation explicite', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSuperAdminListing).mockResolvedValue(listing());
    vi.mocked(revokeSuperAdminInvitation).mockResolvedValue(
      invitation({ status: 'revoked' }),
    );

    renderPage();

    const ligne = await screen.findByTestId('invitation-7');
    await user.click(within(ligne).getByRole('button', { name: /^Annuler l’invitation$|^Annuler l'invitation$/ }));

    // Le clic sur la ligne n'annule RIEN par lui-même : la confirmation est
    // le seul chemin vers l'appel réseau.
    expect(revokeSuperAdminInvitation).not.toHaveBeenCalled();

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText(/Annuler cette invitation/)).toBeInTheDocument();
    await user.click(
      within(dialogue).getByRole('button', {
        name: /^Annuler l’invitation$|^Annuler l'invitation$/,
      }),
    );

    await waitFor(() => {
      expect(revokeSuperAdminInvitation).toHaveBeenCalledWith(7);
    });
  });

  it('renonce à l’annulation quand on choisit « Conserver »', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchSuperAdminListing).mockResolvedValue(listing());

    renderPage();

    const ligne = await screen.findByTestId('invitation-7');
    await user.click(within(ligne).getByRole('button', { name: /^Annuler l’invitation$|^Annuler l'invitation$/ }));

    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Conserver' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(revokeSuperAdminInvitation).not.toHaveBeenCalled();
  });
});
