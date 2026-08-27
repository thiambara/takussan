import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { PendingInvitationsSection } from '../PendingInvitationsSection';

const mockFetch = vi.fn();
const mockResend = vi.fn();
const mockRevoke = vi.fn();

vi.mock('@/lib/queries/agency-invitations', () => ({
  agencyInvitationKeys: {
    all: ['agency-invitations'] as const,
    pending: (agencyId: number, page: number) =>
      ['agency-invitations', 'pending', agencyId, page] as const,
  },
  DEFAULT_PER_PAGE: 10,
  fetchPendingAgencyInvitations: (...args: unknown[]) => mockFetch(...args),
  resendInvitation: (...args: unknown[]) => mockResend(...args),
  revokeInvitation: (...args: unknown[]) => mockRevoke(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));

function invitation(
  overrides: Partial<{
    id: number;
    email: string;
    role: string;
    created_at: string;
    is_expired: boolean;
  }> = {},
) {
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
    is_expired: overrides.is_expired ?? false,
  };
}

function page(
  rows: ReturnType<typeof invitation>[],
  meta: Partial<{ current_page: number; last_page: number; per_page: number; total: number }> = {},
) {
  return {
    data: rows,
    meta: {
      current_page: meta.current_page ?? 1,
      last_page: meta.last_page ?? 1,
      per_page: meta.per_page ?? 10,
      total: meta.total ?? rows.length,
    },
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

  // ------------------------------------------------------------------
  // Revue — les deux gestes visent la ligne DÉSIGNÉE
  // ------------------------------------------------------------------

  /**
   * D3 — le seul test multi-lignes ne cliquait rien, et les trois tests qui
   * cliquaient n'avaient qu'une ligne. Mutation exécutée sur le composant :
   * `mutate(invitation)` → `mutate(rows[0])` sur les DEUX gestes → 8/8 verts.
   * Un écran qui révoquerait toujours la première invitation de la liste
   * passait la suite — sur un geste irréversible pour le destinataire.
   *
   * Le test clique donc dans la DEUXIÈME ligne d'une liste à trois, et assert
   * l'id de cette ligne-là. Viser la deuxième et pas la dernière est délibéré :
   * `rows[rows.length - 1]` serait un second raccourci qui coche « la
   * dernière », et il resterait vert.
   */
  it('relance l’invitation DÉSIGNÉE, pas la première de la liste', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([
      invitation({ id: 7, email: 'fatou@exemple.sn' }),
      invitation({ id: 8, email: 'ousmane@exemple.sn' }),
      invitation({ id: 9, email: 'awa@exemple.sn' }),
    ]));

    monter();
    await screen.findByText('ousmane@exemple.sn');

    const ligne = screen.getByTestId('pending-invitation-8');
    await user.click(within(ligne).getByRole('button', { name: /Relancer/ }));

    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('jeton-de-test', 8));
    expect(
      await screen.findByText('Invitation renvoyée à ousmane@exemple.sn.'),
    ).toBeInTheDocument();
  });

  it('révoque l’invitation DÉSIGNÉE, pas la première de la liste', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([
      invitation({ id: 7, email: 'fatou@exemple.sn' }),
      invitation({ id: 8, email: 'ousmane@exemple.sn' }),
      invitation({ id: 9, email: 'awa@exemple.sn' }),
    ]));

    monter();
    await screen.findByText('ousmane@exemple.sn');

    const ligne = screen.getByTestId('pending-invitation-8');
    await user.click(within(ligne).getByRole('button', { name: /Annuler/ }));

    // La confirmation NOMME la ligne désignée : une boîte qui parlerait de
    // `fatou` ferait révoquer la mauvaise invitation à un admin qui lit.
    expect(
      await screen.findByText(/Le lien déjà envoyé à ousmane@exemple\.sn/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Annuler l'invitation" }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('jeton-de-test', 8));
  });

  // ------------------------------------------------------------------
  // Revue — l'invitation expirée
  // ------------------------------------------------------------------

  /**
   * D2 — une invitation morte reste à l'écran et SE DIT morte. Le champ vient
   * du serveur (`is_expired`) : le front ne peut pas le déduire de `status`,
   * le cron tournant à l'heure.
   */
  it('marque les invitations expirées, et les laisse relançables', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([
      invitation({ id: 7, email: 'fatou@exemple.sn', is_expired: false }),
      invitation({ id: 8, email: 'ousmane@exemple.sn', is_expired: true }),
    ]));

    monter();
    await screen.findByText('ousmane@exemple.sn');

    expect(screen.getByTestId('invitation-expired-8')).toHaveTextContent('Expirée');
    expect(screen.queryByTestId('invitation-expired-7')).not.toBeInTheDocument();
    expect(screen.getAllByText('En attente')).toHaveLength(1);

    // Elle reste ACTIONNABLE : c'est par ce bouton que le serveur la
    // ressuscite, au lieu qu'un « Inviter » pose une seconde ligne.
    const ligne = screen.getByTestId('pending-invitation-8');
    await user.click(within(ligne).getByRole('button', { name: /Relancer/ }));
    await waitFor(() => expect(mockResend).toHaveBeenCalledWith('jeton-de-test', 8));
  });

  // ------------------------------------------------------------------
  // Revue — le compte et la pagination
  // ------------------------------------------------------------------

  /**
   * D5 — le badge rendait `rows.length`. Mesuré à 13 invitations : dix lignes,
   * `meta.total = 13`, et un badge affichant « 10 ». *Un compte faux à
   * l'écran, pas seulement une troncature.*
   */
  it('affiche le compte du SERVEUR, pas le nombre de lignes rendues', async () => {
    mockFetch.mockResolvedValue(
      page(
        Array.from({ length: 10 }, (_, i) => invitation({ id: i + 1, email: `invite-${i}@exemple.sn` })),
        { total: 13, last_page: 2 },
      ),
    );

    monter();

    await screen.findByText('invite-0@exemple.sn');
    expect(screen.getByTestId('pending-invitations-count')).toHaveTextContent('13');
  });

  /**
   * D5, suite — les invitations au-delà de la première page sont ATTEIGNABLES.
   * Sans pagination, trois invitations en attente ne pouvaient être ni vues,
   * ni relancées, ni révoquées : l'objectif même de la section.
   */
  it('pagine : la seconde page est demandée et rendue', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 10 }, (_, i) => invitation({ id: i + 1, email: `invite-${i}@exemple.sn` })),
          { total: 13, last_page: 2, current_page: 1 },
        ),
      )
      .mockResolvedValue(
        page(
          [invitation({ id: 11, email: 'onzieme@exemple.sn' })],
          { total: 13, last_page: 2, current_page: 2 },
        ),
      );

    monter();
    await screen.findByText('invite-0@exemple.sn');

    await user.click(screen.getByRole('button', { name: /Suivant/ }));

    expect(await screen.findByText('onzieme@exemple.sn')).toBeInTheDocument();
    // La page part bien au SERVEUR — une pagination qui trancherait côté client
    // une liste déjà tronquée ne ramènerait jamais la onzième ligne.
    expect(mockFetch).toHaveBeenLastCalledWith('jeton-de-test', { page: 2, perPage: 10 });
  });

  it('ne rend aucune pagination sur une seule page', async () => {
    mockFetch.mockResolvedValue(page([invitation({ id: 7 })]));

    monter();

    await screen.findByText('fatou@exemple.sn');
    expect(screen.queryByRole('button', { name: /Suivant/ })).not.toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Revue — les branches d'échec
  // ------------------------------------------------------------------

  /**
   * D8 — `mockResend` et `mockRevoke` ne rejetaient JAMAIS dans tout le
   * fichier : les deux `onError` étaient du code mort pour la suite. Or c'est
   * la branche qu'un 403 ou un 422 emprunte.
   */
  it('dit à l’écran que la relance a échoué', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([invitation({ id: 7, email: 'fatou@exemple.sn' })]));
    mockResend.mockRejectedValue(new ApiError(422, { message: 'Cette invitation ne peut plus être relancée.' }));

    monter();
    await screen.findByText('fatou@exemple.sn');

    await user.click(screen.getByRole('button', { name: /Relancer/ }));

    expect(await screen.findByText("L'action n'a pas abouti.")).toBeInTheDocument();
    expect(
      await screen.findByText('Cette invitation ne peut plus être relancée.'),
    ).toBeInTheDocument();
    // La ligne est TOUJOURS là : rien n'a été retiré de l'écran sur un geste
    // qui a échoué.
    expect(screen.getByTestId('pending-invitation-7')).toBeInTheDocument();
  });

  /**
   * D8, suite — et l'échec de la révocation REFERME la boîte de confirmation.
   * C'est la seule chose que fait `onError` en plus du toast, et une boîte
   * restée ouverte sur un échec invite à re-cliquer.
   */
  it('referme la confirmation et le dit quand la révocation échoue', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(page([invitation({ id: 7, email: 'fatou@exemple.sn' })]));
    mockRevoke.mockRejectedValue(new ApiError(403, { message: 'Action non autorisée.' }));

    monter();
    await screen.findByText('fatou@exemple.sn');

    await user.click(screen.getByRole('button', { name: /Annuler/ }));
    await screen.findByText('Annuler cette invitation ?');
    await user.click(screen.getByRole('button', { name: "Annuler l'invitation" }));

    expect(await screen.findByText("L'action n'a pas abouti.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Annuler cette invitation ?')).not.toBeInTheDocument());
    expect(screen.getByTestId('pending-invitation-7')).toBeInTheDocument();
  });
});
