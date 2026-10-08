import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileReviewsList } from '../ProfileReviewsList';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { UserRole } from '@/types/user';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 1 } }),
}));
vi.mock('@/app/actions/property', () => ({
  submitPropertyReport: vi.fn(),
  submitReviewReport: vi.fn(),
}));

const emptyPage = {
  data: [],
  meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
};

function page(data: unknown[], meta: Partial<typeof emptyPage.meta> = {}) {
  return { ...emptyPage, data, meta: { ...emptyPage.meta, total: data.length, ...meta } };
}

function renderList(roles: UserRole[] = ['customer']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ProfileReviewsList roles={roles} />
      </ToastProvider>
    </QueryClientProvider>,
  ));
}

type Appel = { url: string; method: string; body: unknown };

function mockFetch({
  authored = [],
  opportunities = [],
  received = page([]),
}: {
  authored?: unknown[];
  opportunities?: unknown[];
  received?: unknown;
}) {
  const appels: Appel[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    appels.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    const payload = init?.method === 'POST'
      ? { data: { id: 1 } }
      : url.includes('/api/reviews/received')
        ? received
        : url.includes('/api/me/review-opportunities')
          ? { data: opportunities }
          : url.includes('/api/reviews')
            ? page(authored)
            : emptyPage;

    return {
      ok: true,
      status: init?.method === 'POST' ? 201 : 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  });

  vi.stubGlobal('fetch', spy);
  return appels;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const avisPoste = {
  id: 42,
  reviewable_type: 'App\\Models\\Property',
  reviewable_id: 7,
  target: {
    type: 'property',
    id: 7,
    title: 'Appartement F2 à Ouakam',
    slug: 'appartement-f2-ouakam',
    subtitle: 'TK-TEST-236',
  },
  author_id: 1,
  author: { id: 1, name: 'Aïssa Diop', avatar_url: null },
  rating: 4,
  title: 'Très bon séjour',
  content: 'Appartement propre et bien situé.',
  is_approved: true,
  status: 'approved',
  reported_count: 0,
  reply_content: null,
  replied_at: null,
  created_at: '2026-05-07T10:00:00Z',
};

describe('<ProfileReviewsList>', () => {
  it('lists reviews posted by the current user', async () => {
    const appels = mockFetch({ authored: [avisPoste] });

    renderList();

    await waitFor(() =>
      expect(screen.getByText('Appartement F2 à Ouakam')).toBeInTheDocument(),
    );

    expect(screen.getByText('Très bon séjour')).toBeInTheDocument();
    expect(screen.getByText('Appartement propre et bien situé.')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByText('Approuvé')).toBeInTheDocument();
    expect(screen.getByText(/TK-TEST-236/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Avis à laisser' })).toBeInTheDocument();
    expect(appels.find((a) => a.url.includes('/api/reviews?'))?.url).toContain('filter[author_id]=me');
  });

  it('shows a localized empty state when the user has not posted reviews', async () => {
    mockFetch({});

    renderList();

    await waitFor(() =>
      expect(screen.getByText("Vous n'avez pas encore publié d'avis.")).toBeInTheDocument(),
    );
    expect(await screen.findByText("Aucun séjour ni bail ouvert à évaluer pour l'instant.")).toBeInTheDocument();
  });
});

/**
 * TCK-597 (C18, P20) — les invitations viennent du serveur (`/api/me/review-opportunities`) ; le
 * bien et l'agent d'un même bail se notent dans UN formulaire, et chaque note part sur l'endpoint
 * de sa cible. Avant : l'écran assemblait réservations et baux, et renvoyait vers la fiche du bien.
 */
describe('<ProfileReviewsList> — invitations à noter', () => {
  const bail = { type: 'lease', id: 5 };
  const opportunites = [
    { type: 'agent', subject: { id: 12, title: 'Moussa Fall', slug: 'moussa' }, context: bail },
    { type: 'property', subject: { id: 7, title: 'Villa Ngor', slug: 'villa-ngor' }, context: bail },
    { type: 'service_provider', subject: { id: 3, title: 'Plomberie Sarr', slug: null }, context: { type: 'maintenance_request', id: 77 } },
  ];

  it('un formulaire par contexte, bien et agent ensemble, sans assemblage côté client', async () => {
    const appels = mockFetch({ opportunities: opportunites });
    renderList();

    const formulaire = await screen.findByRole('form', { name: 'Villa Ngor' });
    expect(within(formulaire).getByText('Votre bail')).toBeInTheDocument();
    const groupes = within(formulaire).getAllByRole('group');
    expect(groupes.map((g) => g.querySelector('legend')?.textContent)).toEqual([
      'Le bien · Villa Ngor',
      "L'agent · Moussa Fall",
    ]);
    expect(screen.getByRole('form', { name: 'Plomberie Sarr' })).toBeInTheDocument();

    // Aucune réservation ni bail rapatriés pour deviner ce qui se note.
    expect(appels.some((a) => a.url.includes('/api/bookings') || a.url.includes('/api/leases'))).toBe(false);
  });

  it('chaque note part sur l’endpoint de sa cible', async () => {
    const appels = mockFetch({ opportunities: opportunites });
    const user = userEvent.setup();
    renderList();

    const formulaire = await screen.findByRole('form', { name: 'Villa Ngor' });
    const [bien, agent] = within(formulaire).getAllByRole('group');
    await user.click(within(bien!).getByLabelText('4 étoiles'));
    await user.click(within(agent!).getByLabelText('5 étoiles'));
    await user.type(within(agent!).getByLabelText(/commentaire/i), 'Très disponible');
    await user.click(within(formulaire).getByRole('button', { name: /publier mes avis/i }));

    await waitFor(() => expect(appels.filter((a) => a.method === 'POST')).toHaveLength(2));
    const posts = appels.filter((a) => a.method === 'POST');
    expect(posts[0]).toMatchObject({ body: { rating: 4 } });
    expect(posts[0]!.url).toContain('/api/properties/7/reviews');
    expect(posts[1]!.url).toContain('/api/agents/12/reviews');
    expect(posts[1]).toMatchObject({ body: { rating: 5, content: 'Très disponible' } });
  });

  it('le prestataire est noté avec l’intervention qui l’autorise', async () => {
    const appels = mockFetch({ opportunities: opportunites });
    const user = userEvent.setup();
    renderList();

    const formulaire = await screen.findByRole('form', { name: 'Plomberie Sarr' });
    await user.click(within(formulaire).getByLabelText('3 étoiles'));
    await user.click(within(formulaire).getByRole('button', { name: /publier mes avis/i }));

    await waitFor(() => expect(appels.some((a) => a.method === 'POST')).toBe(true));
    const post = appels.find((a) => a.method === 'POST')!;
    expect(post.url).toContain('/api/service-providers/3/reviews');
    expect(post.body).toEqual({ rating: 3, maintenance_request_id: 77 });
  });

  it('sans note, rien ne part', async () => {
    const appels = mockFetch({ opportunities: opportunites });
    const user = userEvent.setup();
    renderList();

    const formulaire = await screen.findByRole('form', { name: 'Villa Ngor' });
    await user.click(within(formulaire).getByRole('button', { name: /publier mes avis/i }));

    expect(await within(formulaire).findByRole('alert')).toHaveTextContent(/au moins une note/i);
    expect(appels.some((a) => a.method === 'POST')).toBe(false);
  });
});

/**
 * TCK-597 (A15) — la boîte des avis reçus : UNE requête paginée, filtrée par le serveur. Avant :
 * une requête par bien (`/api/properties/{id}/reviews`), filtrée sur la liste rapatriée, et une
 * réponse rédigée dans `window.prompt`.
 */
describe('<ProfileReviewsList> — boîte des avis reçus', () => {
  const recu = (overrides: Record<string, unknown> = {}) => ({
    ...avisPoste,
    id: 90,
    author: { id: 5, name: 'Awa Ndiaye', avatar_url: null },
    target: { type: 'property', id: 7, title: 'Villa Ngor', slug: 'villa-ngor', subtitle: null },
    title: 'Bon accueil',
    can_reply: true,
    ...overrides,
  });

  it('un client sans profil professionnel n’a pas de boîte', async () => {
    const appels = mockFetch({});
    renderList(['customer']);

    await screen.findByText("Vous n'avez pas encore publié d'avis.");
    expect(screen.queryByRole('heading', { name: 'Avis reçus' })).toBeNull();
    expect(appels.some((a) => a.url.includes('/api/reviews/received'))).toBe(false);
  });

  it('l’agent reçoit sa boîte en une requête ; les filtres partent au serveur', async () => {
    const appels = mockFetch({ received: page([recu()], { last_page: 2 }) });
    const user = userEvent.setup();
    renderList(['agent', 'customer']);

    expect(await screen.findByTestId('received-review-90')).toHaveTextContent('Bon accueil');
    const premieres = appels.filter((a) => a.url.includes('/api/reviews/received'));
    expect(premieres).toHaveLength(1);
    expect(appels.some((a) => /\/api\/properties\/\d+\/reviews/.test(a.url))).toBe(false);

    await user.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }));
    await user.click(await screen.findByRole('option', { name: 'En attente' }));
    await waitFor(() =>
      expect(appels.filter((a) => a.url.includes('/api/reviews/received')).at(-1)!.url).toContain('filter[status]=pending'),
    );

    await user.click(screen.getByRole('combobox', { name: 'Filtrer par réponse' }));
    await user.click(await screen.findByRole('option', { name: 'Sans réponse' }));
    await waitFor(() =>
      expect(appels.filter((a) => a.url.includes('/api/reviews/received')).at(-1)!.url).toContain('filter[replied]=0'),
    );

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() =>
      expect(appels.filter((a) => a.url.includes('/api/reviews/received')).at(-1)!.url).toContain('page=2'),
    );
  });

  it('un avis en attente est visible et marqué, sans réponse possible', async () => {
    mockFetch({ received: page([recu({ status: 'pending', is_approved: false })]) });
    renderList(['owner', 'customer']);

    const carte = await screen.findByTestId('received-review-90');
    expect(carte).toHaveTextContent(/en attente de validation/i);
    expect(within(carte).queryByRole('button', { name: /répondre/i })).toBeNull();
  });

  // verif-597 m1 — « Répondre » suit `can_reply` (policy de l'API) : le collaborateur d'une autre
  // agence voit l'avis dans sa boîte, sans le geste que l'API lui refuserait.
  it('sans `can_reply`, l’avis reste lisible et signalable, sans « Répondre »', async () => {
    mockFetch({ received: page([recu({ can_reply: false })]) });
    renderList(['agent', 'customer']);

    const carte = await screen.findByTestId('received-review-90');
    expect(within(carte).queryByRole('button', { name: /répondre/i })).toBeNull();
    expect(within(carte).getByRole('button', { name: /signaler cet avis/i })).toBeInTheDocument();
  });

  it('la réponse se rédige dans la page, sans boîte de dialogue du navigateur', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const appels = mockFetch({ received: page([recu()]) });
    const user = userEvent.setup();
    renderList(['agency_admin', 'customer']);

    const carte = await screen.findByTestId('received-review-90');
    await user.click(within(carte).getByRole('button', { name: 'Répondre' }));
    const champ = within(carte).getByLabelText('Votre réponse publique');
    expect(champ).toHaveFocus();

    await user.click(within(carte).getByRole('button', { name: /publier la réponse/i }));
    expect(within(carte).getByRole('alert')).toHaveTextContent(/écrivez une réponse/i);

    await user.type(champ, 'Merci pour votre retour');
    await user.click(within(carte).getByRole('button', { name: /publier la réponse/i }));

    await waitFor(() => expect(appels.some((a) => a.method === 'POST')).toBe(true));
    const post = appels.find((a) => a.method === 'POST')!;
    expect(post.url).toContain('/api/reviews/90/reply');
    expect(post.body).toEqual({ reply_content: 'Merci pour votre retour' });
    expect(prompt).not.toHaveBeenCalled();
  });
});
