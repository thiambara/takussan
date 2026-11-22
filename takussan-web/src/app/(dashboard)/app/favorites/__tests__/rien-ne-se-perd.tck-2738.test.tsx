/**
 * TCK-2738 — ce que seuls `FavoritesList.test` et `SavedSearchesList.alerte.test` éprouvaient
 * encore, rejoué sur les PAGES de route que Next rend (`SuiviDesFavoris` dans la coque de `/app`),
 * avant le retrait des deux composants que plus aucune page ne rendait. Le reste de leurs gestes
 * l'est déjà par `favoris-dans-la-coque.tck-2618.test.tsx`.
 *
 * - la pagination : la page 2 est DEMANDÉE à l'API avec `page=2` (TCK-599 AC7) ;
 * - la note d'un favori disponible se modifie en place par `PATCH /api/favorites/{bien}` ;
 * - un favori RETIRÉ (`property: null`) et un favori loué se rendent à côté d'un favori disponible,
 *   éteints, sans prix ni lieu ; « Retirer » vise l'identifiant du BIEN ;
 * - régler l'alerte d'une ligne sur « hebdomadaire » envoie le `PATCH` sur CETTE recherche, et une
 *   alerte ne nomme que ses canaux effectifs.
 *
 * Le réseau est bouchonné au niveau de `fetch` : ce sont les requêtes réellement émises qui comptent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { CompareProvider } from '@/context/CompareContext';

const etat = vi.hoisted(() => ({ chemin: '/app/favorites' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => etat.chemin,
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1 }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false, refreshUser: async () => 'ouverte', logout: async () => {} }),
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar-publique" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer-public" /> }));

const { default: PageDesFavoris } = await import('../page');
const { default: PageDesRecherches } = await import('../../saved-searches/page');

const P = fr.favorites.page;
const T = fr.search.saved;
const PAGINATION = fr.favorites.suivi.pagination;

const DISPONIBLE = {
  id: 1,
  property_id: 10,
  user_id: 1,
  notes: 'Appeler lundi',
  availability: 'available',
  price_change: null,
  created_at: '2026-10-01T09:00:00Z',
  property: {
    id: 10,
    slug: 'villa-ngor',
    title: 'Villa Ngor',
    price: 500000,
    currency: 'XOF',
    type: 'villa',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: 3,
    bathrooms: 2,
    area: 200,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: '2026-06-01T10:00:00Z',
    created_at: '2026-06-01T10:00:00Z',
    address: { city: 'Dakar', quarter: 'Ngor' },
  },
};
const LOUE = {
  id: 2,
  property_id: 11,
  user_id: 1,
  notes: null,
  availability: 'rented',
  price_change: null,
  created_at: '2026-10-01T09:00:00Z',
  property: { id: 11, slug: 'appartement-plateau', title: 'Appartement Plateau' },
};
const RETIRE = {
  id: 3,
  property_id: 12,
  user_id: 1,
  notes: null,
  availability: 'removed',
  price_change: null,
  created_at: '2026-10-01T09:00:00Z',
  property: null,
};

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
const page = (data: unknown[], current: number, last: number) =>
  json({ data, meta: { current_page: current, last_page: last, per_page: 24, total: 30 } });

type Appel = { url: URL; method: string; body: unknown };
let appels: Appel[] = [];
let favoris: (url: URL) => Response = () => page([], 1, 1);
let recherches: unknown[] = [];

beforeEach(() => {
  class ObservateurInerte {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  localStorage.clear();
  appels = [];
  recherches = [];
  favoris = () => page([], 1, 1);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string, init?: RequestInit) => {
      const url = new URL(String(u), 'http://api.test');
      const method = init?.method ?? 'GET';
      appels.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      if (url.pathname === '/api/favorites' && method === 'GET') return favoris(url);
      if (url.pathname.startsWith('/api/favorites/') && method === 'DELETE') return new Response(null, { status: 204 });
      if (url.pathname.startsWith('/api/favorites/') && method === 'PATCH') return json({ data: { ...DISPONIBLE, notes: 'Visite samedi' } });
      if (url.pathname === '/api/saved-searches' && method === 'GET') return json({ data: recherches });
      if (url.pathname.startsWith('/api/saved-searches/') && method === 'PATCH') return json({ data: recherches[0] });
      return json({ data: [], meta: { total: 0 } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function monter(quoi: 'favoris' | 'recherches') {
  etat.chemin = quoi === 'favoris' ? '/app/favorites' : '/app/saved-searches';
  const element = quoi === 'favoris' ? await PageDesFavoris() : await PageDesRecherches();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>{element}</CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const pageDemandee = (a: Appel) => a.url.pathname === '/api/favorites' && a.method === 'GET' ? a.url.searchParams.get('page') : null;

describe('TCK-2738 — `/app/favorites` garde ce que `FavoritesList` faisait', () => {
  it('un favori retiré et un favori loué, éteints, sans prix ni lieu, à côté d’un favori disponible', async () => {
    favoris = () => page([DISPONIBLE, LOUE, RETIRE], 1, 1);
    await monter('favoris');

    expect(await screen.findByText(/Villa Ngor/)).toBeInTheDocument();
    const eteintes = screen.getAllByTestId('favorite-unavailable');
    expect(eteintes.map((e) => e.dataset.availability)).toEqual(['rented', 'removed']);
    expect(eteintes[0]).toHaveTextContent('Appartement Plateau');
    expect(eteintes[0]).toHaveTextContent(P.availability.rented);
    expect(eteintes[1]).toHaveTextContent(P.removedTitle);
    expect(eteintes[1]).toHaveTextContent(P.availability.removed);
    for (const carte of eteintes) {
      expect(carte).not.toHaveTextContent(/FCFA|XOF|Dakar|Ngor/);
      expect(within(carte).getByRole('button', { name: new RegExp(P.remove) })).toBeInTheDocument();
    }
    expect(screen.getByText('Appeler lundi')).toBeInTheDocument();
  });

  it('« Retirer » sur un favori éteint appelle DELETE sur l’identifiant du BIEN', async () => {
    favoris = () => page([LOUE], 1, 1);
    const user = userEvent.setup();
    await monter('favoris');
    const eteinte = await screen.findByTestId('favorite-unavailable');

    await user.click(within(eteinte).getByRole('button', { name: new RegExp(P.remove) }));

    await waitFor(() => expect(appels.some((a) => a.method === 'DELETE')).toBe(true));
    expect(appels.find((a) => a.method === 'DELETE')!.url.pathname).toBe('/api/favorites/11');
  });

  it('demande la page 2 à l’API avec `page=2`', async () => {
    favoris = (url) =>
      url.searchParams.get('page') === '2'
        ? page([{ ...LOUE, id: 9, property_id: 19, property: { id: 19, slug: 's', title: 'Studio Mermoz' } }], 2, 2)
        : page([DISPONIBLE], 1, 2);
    const user = userEvent.setup();
    await monter('favoris');
    await screen.findByText(/Villa Ngor/);
    expect(appels.map(pageDemandee).filter(Boolean)).toEqual(['1']);

    await user.click(screen.getByRole('button', { name: new RegExp(PAGINATION.suivante) }));

    expect(await screen.findByText('Studio Mermoz')).toBeInTheDocument();
    expect(appels.map(pageDemandee)).toContain('2');
    expect(screen.queryByText(/Villa Ngor/)).toBeNull();
  });

  it('la note se modifie en place par PATCH /api/favorites/{bien}', async () => {
    favoris = () => page([DISPONIBLE], 1, 1);
    const user = userEvent.setup();
    await monter('favoris');
    await screen.findByText('Appeler lundi');

    await user.click(screen.getByRole('button', { name: P.note.edit }));
    const champ = screen.getByLabelText(P.note.label);
    await user.clear(champ);
    await user.type(champ, 'Visite samedi');
    await user.click(screen.getByRole('button', { name: P.note.save }));

    await waitFor(() => expect(appels.some((a) => a.method === 'PATCH')).toBe(true));
    const patch = appels.find((a) => a.method === 'PATCH')!;
    expect(patch.url.pathname).toBe('/api/favorites/10');
    expect(patch.body).toEqual({ notes: 'Visite samedi' });
  });
});

describe('TCK-2738 — `/app/saved-searches` garde ce que `SavedSearchesList` faisait de l’alerte', () => {
  const recherche = (id: number, name: string, extra: Record<string, unknown>) => ({
    id,
    user_id: 1,
    name,
    criteria: { city: name },
    is_active: true,
    results_count: 0,
    created_at: null,
    last_viewed_at: null,
    ...extra,
  });

  it('régler « hebdomadaire » envoie PATCH { notification_frequency } sur CETTE recherche ; les canaux sont les effectifs', async () => {
    recherches = [
      recherche(7, 'Dakar', { notification_frequency: 'daily', alert_channels: ['inapp'] }),
      recherche(8, 'Thiès', { notification_frequency: 'off', alert_channels: [] }),
    ];
    const user = userEvent.setup();
    await monter('recherches');
    const lignes = await screen.findAllByTestId('recherche-suivie');
    const thies = lignes.find((l) => l.dataset.searchId === '8')!;
    const dakar = lignes.find((l) => l.dataset.searchId === '7')!;
    expect(dakar).toHaveTextContent(fr.search.alertChannels.inapp);
    expect(dakar).not.toHaveTextContent(fr.search.alertChannels.email);

    const reglage = within(thies).getByRole('group', { name: T.alertAria.replace('{name}', 'Thiès') });
    expect(within(reglage).getByRole('button', { name: T.frequency.off })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(reglage).getByRole('button', { name: T.frequency.weekly }));

    await waitFor(() => expect(appels.some((a) => a.method === 'PATCH')).toBe(true));
    const patch = appels.find((a) => a.method === 'PATCH')!;
    expect(patch.url.pathname).toBe('/api/saved-searches/8');
    expect(patch.body).toEqual({ notification_frequency: 'weekly' });
  });
});
