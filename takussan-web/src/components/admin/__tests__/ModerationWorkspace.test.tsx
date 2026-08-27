import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { ModerationWorkspace } from '../ModerationWorkspace';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockFetchQueue = vi.fn();
const mockFetchReports = vi.fn();
const mockModerate = vi.fn();

vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: (...args: unknown[]) => mockFetchQueue(...args),
  fetchReviewReports: (...args: unknown[]) => mockFetchReports(...args),
  moderateReview: (...args: unknown[]) => mockModerate(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
}));

// TCK-376 — l'état de l'écran vit désormais dans l'URL. Le mock la pilote dans les deux sens :
// `urlCourante` est ce que le composant LIT, `replace` est ce qu'il ÉCRIT.
let urlCourante = '';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(urlCourante),
}));

/** Les paramètres de la dernière URL écrite. */
function derniereUrl(): URLSearchParams {
  const appel = replace.mock.calls.at(-1);
  if (!appel) throw new Error('router.replace n’a pas été appelé');
  return new URLSearchParams(String(appel[0]).replace(/^\?/, ''));
}

/** Les paramètres du dernier appel à `fetchModerationQueue` — ce qui part vraiment au serveur. */
function derniersParams() {
  const appel = mockFetchQueue.mock.calls.at(-1);
  if (!appel) throw new Error('fetchModerationQueue n’a pas été appelé');
  return appel[1] as Record<string, unknown>;
}

function metaDe(overrides: Partial<{ last_page: number; current_page: number; total: number }> = {}) {
  return {
    total: overrides.total ?? 2,
    current_page: overrides.current_page ?? 1,
    last_page: overrides.last_page ?? 1,
    per_page: 20,
    pending_count: 2,
  };
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeReview(overrides: Partial<{
  id: number;
  rating: number;
  title: string;
  content: string;
  status: string;
  reported_count: number;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    rating: overrides.rating ?? 4,
    title: overrides.title ?? 'Bel avis',
    content: overrides.content ?? 'Contenu de test',
    author: { id: 10, name: 'John Doe', avatar_url: null },
    reviewable_type: 'App\\Models\\Property',
    reviewable_id: 99,
    status: overrides.status ?? 'pending',
    is_approved: false,
    reported_count: overrides.reported_count ?? 0,
    created_at: '2025-01-01T00:00:00Z',
  };
}

describe('<ModerationWorkspace>', () => {
  beforeEach(() => {
    urlCourante = '';
    replace.mockReset();
    mockFetchQueue.mockReset();
    mockFetchReports.mockReset();
    mockModerate.mockReset();
    mockFetchReports.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
  });

  it('renders the queue list and auto-selects the first review', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [
        makeReview({ id: 1, title: 'Premier avis' }),
        makeReview({ id: 2, title: 'Second avis', status: 'reported', reported_count: 3 }),
      ],
      meta: { total: 2, current_page: 1, last_page: 1, per_page: 20, pending_count: 2 },
      links: { first: null, last: null, prev: null, next: null },
    });

    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-queue-item-1');
    expect(screen.getByTestId('moderation-queue-item-1')).toHaveTextContent('Premier avis');
    expect(screen.getByTestId('moderation-queue-item-2')).toHaveTextContent('Second avis');
    // The detail panel shows the first review.
    expect(screen.getByTestId('moderation-detail')).toHaveTextContent('Premier avis');
  });

  it('triggers approve decision without requiring a reason', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [makeReview({ id: 1 })],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20, pending_count: 1 },
      links: { first: null, last: null, prev: null, next: null },
    });
    mockModerate.mockResolvedValue({ data: makeReview({ id: 1 }) });

    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-detail');

    await user.click(screen.getByRole('button', { name: /^approuver$/i }));

    await waitFor(() => expect(mockModerate).toHaveBeenCalled());
    expect(mockModerate).toHaveBeenCalledWith(
      1,
      { decision: 'approve', reason: undefined },
      'fake-token',
    );
  });

  it('requires a reason for a delete decision', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [makeReview({ id: 7 })],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20, pending_count: 1 },
      links: { first: null, last: null, prev: null, next: null },
    });

    const user = userEvent.setup();
    render(wrap(<ModerationWorkspace />));

    await screen.findByTestId('moderation-detail');
    await user.click(screen.getByRole('button', { name: /supprimer/i }));

    // Confirmation pane visible
    expect(await screen.findByTestId('moderation-confirm')).toBeInTheDocument();

    // Confirm without reason triggers validation message, no mutation call
    await user.click(screen.getByRole('button', { name: /confirmer/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/raison est requise/i);
    expect(mockModerate).not.toHaveBeenCalled();

    // Provide reason and confirm
    await user.type(screen.getByLabelText(/raison/i), 'contenu offensant');
    await user.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() => expect(mockModerate).toHaveBeenCalled());
    expect(mockModerate).toHaveBeenCalledWith(
      7,
      { decision: 'delete', reason: 'contenu offensant' },
      'fake-token',
    );
  });
});

/**
 * TCK-376 — l'état partageable et la pagination de la file d'avis.
 *
 * Les quatre filtres vivaient en `useState` : un rechargement les perdait, un lien collé n'en
 * transportait rien. Et la requête ne portait aucun `page` — ce que la première réponse
 * contenait était tout ce que l'écran montrerait jamais.
 */
describe('<ModerationWorkspace> — état d’URL et pagination (TCK-376)', () => {
  beforeEach(() => {
    urlCourante = '';
    replace.mockReset();
    mockFetchQueue.mockReset();
    mockFetchReports.mockReset();
    mockFetchReports.mockResolvedValue({ data: [], meta: { total: 0 } });
    mockFetchQueue.mockResolvedValue({
      data: [makeReview({ id: 1, title: 'Premier avis' }), makeReview({ id: 2, title: 'Second avis' })],
      meta: metaDe({ last_page: 3, current_page: 1 }),
      links: { first: null, last: null, prev: null, next: null },
    });
  });

  // ─── AC1 — un lien copié rouvre LA MÊME file ───────────────────────────────────────────────
  it('AC1 — rejoue les quatre filtres ET la page portés par l’URL', async () => {
    urlCourante =
      'filter[moderation_status]=flagged'
      + '&filter[subject_type]=App%5CModels%5CProperty'
      + '&filter[reported]=1'
      + '&page=3';

    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    // Ce que le SERVEUR reçoit — pas ce que l'écran affiche : le ticket interdit le filtrage
    // sur une liste déjà rapatriée, et une assertion de rendu ne saurait pas les distinguer.
    expect(derniersParams()).toEqual({
      status: 'flagged',
      subjectType: 'App\\Models\\Property',
      reported: true,
      page: 3,
      perPage: 20,
    });

    // ...ET ce que la BARRE affiche. Un écran qui enverrait les bons filtres au serveur en
    // montrant « Tous les statuts » serait vert sur l'assertion ci-dessus et faux à l'usage :
    // l'utilisateur ne saurait pas ce qu'il regarde, et le premier clic sur un autre filtre
    // écraserait celui qu'il croyait absent.
    expect(screen.getByRole('combobox', { name: 'Filtrer par statut' })).toHaveTextContent('Signalés');
    expect(screen.getByRole('combobox', { name: 'Type de sujet' })).toHaveTextContent('Biens');
    expect(screen.getByLabelText(/signalés uniquement/i)).toBeChecked();
    expect(screen.getByText('Page 3 sur 3')).toBeInTheDocument();
  });

  it('AC1 — n’envoie AUCUN filtre quand l’URL est nue', async () => {
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    expect(derniersParams()).toEqual({
      status: undefined,
      subjectType: undefined,
      reported: undefined,
      page: 1,
      perPage: 20,
    });
    expect(screen.getByRole('combobox', { name: 'Filtrer par statut' })).toHaveTextContent('Tous les statuts');
    expect(screen.getByRole('combobox', { name: 'Type de sujet' })).toHaveTextContent('Tous les sujets');
    expect(screen.getByLabelText(/signalés uniquement/i)).not.toBeChecked();
  });

  it('AC1 — la sélection est portée par l’URL, et le clic l’y écrit', async () => {
    urlCourante = 'selected=2';
    render(wrap(<ModerationWorkspace />));

    // Le panneau ouvre l'avis DÉSIGNÉ par le lien, pas le premier de la liste.
    expect(await screen.findByTestId('moderation-detail')).toHaveTextContent('Second avis');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('moderation-queue-item-1').querySelector('button')!);
    expect(derniereUrl().get('selected')).toBe('1');
  });

  it('AC1 — cocher « signalés uniquement » l’écrit dans l’URL et retourne page 1', async () => {
    urlCourante = 'page=7';
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/signalés uniquement/i));

    const params = derniereUrl();
    expect(params.get('filter[reported]')).toBe('1');
    // On filtre depuis la page 7 : sans ce retour, la file rendrait vide et l'écran dirait
    // « aucun résultat » alors que la réponse est page 1.
    expect(params.has('page')).toBe(false);
  });

  it('AC1 — décocher retire le paramètre au lieu d’écrire « 0 »', async () => {
    urlCourante = 'filter[reported]=1';
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/signalés uniquement/i));
    expect(derniereUrl().has('filter[reported]')).toBe(false);
  });

  // ─── AC2 — une file de plus d'une page est parcourable jusqu'à la dernière ──────────────────
  it('AC2 — « Suivant » avance d’une page et la page part au serveur', async () => {
    urlCourante = '';
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(derniereUrl().get('page')).toBe('2');

    // La page suivante est REJOUÉE : c'est ce qui prouve que la requête la porte.
    urlCourante = 'page=2';
    mockFetchQueue.mockClear();
    render(wrap(<ModerationWorkspace />));
    await waitFor(() => expect(mockFetchQueue).toHaveBeenCalled());
    expect(derniersParams().page).toBe(2);
  });

  it('AC2 — la dernière page est atteignable, et « Suivant » y est inerte', async () => {
    urlCourante = 'page=3';
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    expect(screen.getByText('Page 3 sur 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeEnabled();
  });

  it('AC2 — une file d’une seule page ne rend aucune pagination', async () => {
    mockFetchQueue.mockResolvedValue({
      data: [makeReview({ id: 1 })],
      meta: metaDe({ last_page: 1 }),
      links: { first: null, last: null, prev: null, next: null },
    });
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  // ─── Les tables d'options ne sont pas décoratives ───────────────────────────────────────────
  //
  // La revue adverse de TCK-363 a trouvé trois tables de paramètres de filtre qui étaient des
  // MUTANTS SURVIVANTS : les amputer laissait tous les tests verts. Ces deux-ci assèrent la
  // liste ENTIÈRE et à l'identique — retirer une entrée fait rougir.
  it('les cinq statuts sont proposés, aucun de plus', async () => {
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Tous les statuts', 'En attente', 'Signalés', 'Approuvés', 'Rejetés',
    ]);
  });

  it('les quatre types de sujet sont proposés, et le choix part en FQCN au serveur', async () => {
    render(wrap(<ModerationWorkspace />));
    await screen.findByTestId('moderation-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Type de sujet' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Tous les sujets', 'Biens', 'Agences', 'Utilisateurs',
    ]);

    await user.click(screen.getByRole('option', { name: 'Agences' }));
    expect(derniereUrl().get('filter[subject_type]')).toBe('App\\Models\\Agency');
  });
});
