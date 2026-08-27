import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { PendingInvitationsSection } from '../PendingInvitationsSection';

const mockFetch = vi.fn();
const mockResend = vi.fn();
const mockRevoke = vi.fn();

vi.mock('@/lib/queries/agency-invitations', () => ({
  agencyInvitationKeys: {
    all: ['agency-invitations'] as const,
    pending: (agencyId: number) => ['agency-invitations', 'pending', agencyId] as const,
  },
  fetchPendingAgencyInvitations: (...args: unknown[]) => mockFetch(...args),
  resendInvitation: (...args: unknown[]) => mockResend(...args),
  revokeInvitation: (...args: unknown[]) => mockRevoke(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));

function invitation(overrides: Partial<{ id: number; email: string; role: string; created_at: string }> = {}) {
  return {
    id: overrides.id ?? 7,
    email: overrides.email ?? 'fatou@exemple.sn',
    role: overrides.role ?? 'agent',
    status: 'sent' as const,
    agency_id: 12,
    invitable_type: 'App\\Models\\Profiles\\AgentProfile',
    invitable_id: 3,
    expires_at: '2026-09-02T10:00:00Z',
    created_at: overrides.created_at ?? '2026-08-26T10:00:00Z',
  };
}

function page(rows: ReturnType<typeof invitation>[]) {
  return {
    data: rows,
    meta: { current_page: 1, last_page: 1, per_page: 10, total: rows.length },
  };
}

function monter(props: Partial<React.ComponentProps<typeof PendingInvitationsSection>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PendingInvitationsSection
            agencyId={12}
            agencyKind="standard"
            canManage
            {...props}
          />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('<PendingInvitationsSection>', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockResend.mockReset();
    mockRevoke.mockReset();
    mockResend.mockResolvedValue({ data: invitation() });
    mockRevoke.mockResolvedValue({ data: { ...invitation(), status: 'revoked' } });
  });

  it('rend une ligne par invitation en attente : destinataire, rôle et date d’envoi', async () => {
    mockFetch.mockResolvedValue(page([
      invitation({ id: 7, email: 'fatou@exemple.sn', role: 'agent' }),
      invitation({ id: 8, email: 'ousmane@exemple.sn', role: 'service_provider' }),
    ]));

    monter();

    expect(await screen.findByText('fatou@exemple.sn')).toBeInTheDocument();
    expect(screen.getByText('ousmane@exemple.sn')).toBeInTheDocument();
    // Le rôle est TRADUIT, pas rendu brut : `service_provider` à l'écran serait
    // une clé qui a fuité.
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Prestataire')).toBeInTheDocument();
    expect(screen.getAllByText(/26 août 2026/)).toHaveLength(2);
    expect(screen.getByTestId('pending-invitations')).toBeInTheDocument();
  });

  /**
   * AC2 — la relance appelle `resend` ET le confirme à l'écran. Les deux moitiés
   * comptent : un appel réseau silencieux laisse l'utilisateur cliquer trois fois.
   */
  it('relance une invitation sans demander confirmation, et le dit à l’écran', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([invitation({ id: 7, email: 'fatou@exemple.sn' })]));

    monter();
    await screen.findByText('fatou@exemple.sn');

    await user.click(screen.getByRole('button', { name: /Relancer/ }));

    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('jeton-de-test', 7));
    // Aucune confirmation ne s'est interposée : la relance est réversible.
    // ⚠ On cherche le TITRE de la boîte, pas `role="dialog"` : la primitive Toast
    // de base-ui rend elle-même un `role="dialog"`, et le test passerait alors du
    // vert au rouge à cause de la confirmation qu'il vient justement d'exiger.
    expect(screen.queryByText('Annuler cette invitation ?')).not.toBeInTheDocument();
    expect(
      await screen.findByText('Invitation renvoyée à fatou@exemple.sn.'),
    ).toBeInTheDocument();
  });

  /**
   * AC3 — la révocation DEMANDE confirmation, puis fait disparaître la ligne.
   *
   * Le second refetch rend une liste vide : c'est ainsi que la ligne disparaît
   * réellement, sans que le composant retire quoi que ce soit de lui-même.
   */
  it('demande confirmation avant de révoquer, puis la ligne disparaît', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(page([invitation({ id: 7, email: 'fatou@exemple.sn' })]))
      .mockResolvedValue(page([]));

    monter();
    await screen.findByText('fatou@exemple.sn');

    await user.click(screen.getByRole('button', { name: /Annuler/ }));

    // Le clic n'a RIEN révoqué : il a ouvert la confirmation.
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(await screen.findByText('Annuler cette invitation ?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Annuler l'invitation" }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('jeton-de-test', 7));
    await waitFor(() =>
      expect(screen.queryByTestId('pending-invitation-7')).not.toBeInTheDocument());
  });

  it('renonce à la révocation quand on ferme la confirmation', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([invitation({ id: 7 })]));

    monter();
    await screen.findByText('fatou@exemple.sn');

    await user.click(screen.getByRole('button', { name: /Annuler/ }));
    await screen.findByText('Annuler cette invitation ?');
    await user.click(screen.getByRole('button', { name: 'Conserver' }));

    await waitFor(() =>
      expect(screen.queryByText('Annuler cette invitation ?')).not.toBeInTheDocument());
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('pending-invitation-7')).toBeInTheDocument();
  });

  /**
   * AC4 — en agence `individual`, AUCUNE section n'est rendue. Et la requête
   * elle-même n'est pas émise : un 403 dans la console du navigateur serait la
   * trace d'un geste qu'on n'aurait pas dû tenter.
   */
  it("ne rend rien, et ne demande rien, en agence individual", async () => {
    mockFetch.mockResolvedValue(page([invitation()]));

    const { container } = monter({ agencyKind: 'individual' });

    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(screen.queryByTestId('pending-invitations')).not.toBeInTheDocument();
    expect(screen.queryByText('Invitations en attente')).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("se replie entièrement quand aucune invitation n'est en attente", async () => {
    mockFetch.mockResolvedValue(page([]));

    monter();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId('pending-invitations-loading')).not.toBeInTheDocument());
    expect(screen.queryByTestId('pending-invitations')).not.toBeInTheDocument();
    expect(screen.queryByText('Invitations en attente')).not.toBeInTheDocument();
  });

  /**
   * Sans la capacité `team.invite`, la liste reste LISIBLE et les deux gestes
   * disparaissent. Voir une invitation en attente n'est pas pouvoir agir dessus.
   */
  it('cache les deux gestes sans la capacité, sans cacher la liste', async () => {
    mockFetch.mockResolvedValue(page([invitation({ id: 7 })]));

    monter({ canManage: false });

    expect(await screen.findByText('fatou@exemple.sn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Relancer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument();
  });

  it('affiche une erreur réessayable quand la lecture échoue', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    monter();

    expect(
      await screen.findByRole('button', { name: /Réessayer/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('pending-invitations')).not.toBeInTheDocument();
  });
});
