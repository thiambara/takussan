/**
 * TCK-599 — **AC7** : la liste des favoris rend un favori dont le bien n'est plus disponible
 * (projection minimale, ou `null` pour un bien retiré) À CÔTÉ d'un favori disponible, sans
 * exception ; elle est paginée, et la page 2 est DEMANDÉE à l'API avec `page=2`.
 *
 * Rouge avant TCK-599 : `normalizeFavoriteProperty` lisait `raw.location` sur `null`, et la liste
 * ne demandait jamais que la page 1. Le réseau est bouchonné au niveau de `fetch` — c'est l'URL
 * réellement émise qui est vérifiée, pas l'appel d'un crochet.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { FavoritesList } from '../FavoritesList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/favorites',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

beforeAll(() => {
  class ObservateurInerte {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});

const T = fr.favorites.page;

const DISPONIBLE = {
  id: 1,
  property_id: 10,
  user_id: 1,
  notes: 'Appeler lundi',
  availability: 'available',
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
  created_at: '2026-10-01T09:00:00Z',
  property: { id: 11, slug: 'appartement-plateau', title: 'Appartement Plateau' },
};

const RETIRE = {
  id: 3,
  property_id: 12,
  user_id: 1,
  notes: null,
  availability: 'removed',
  created_at: '2026-10-01T09:00:00Z',
  property: null,
};

let urls: string[] = [];

function page(data: unknown[], current: number, last: number): Response {
  return new Response(
    JSON.stringify({ data, meta: { current_page: current, last_page: last, per_page: 24, total: 30 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <FavoritesList />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

describe('<FavoritesList> — TCK-599 AC7', () => {
  beforeEach(() => {
    urls = [];
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url));
        const u = new URL(String(url), 'http://api.test');
        return u.searchParams.get('page') === '2'
          ? page([{ ...LOUE, id: 9, property_id: 19, property: { id: 19, slug: 's', title: 'Studio Mermoz' } }], 2, 2)
          : page([DISPONIBLE, LOUE, RETIRE], 1, 2);
      }),
    );
  });

  it('rend un favori retiré et un favori loué à côté d’un favori disponible, sans prix ni lieu', async () => {
    monte();

    expect(await screen.findByText('Villa Ngor')).toBeInTheDocument();
    const eteintes = screen.getAllByTestId('favorite-unavailable');
    expect(eteintes.map((e) => e.dataset.availability)).toEqual(['rented', 'removed']);
    expect(eteintes[0]).toHaveTextContent('Appartement Plateau');
    expect(eteintes[0]).toHaveTextContent(T.availability.rented);
    expect(eteintes[1]).toHaveTextContent(T.removedTitle);
    expect(eteintes[1]).toHaveTextContent(T.availability.removed);
    for (const carte of eteintes) {
      expect(carte).not.toHaveTextContent(/FCFA|XOF|Dakar/);
      expect(carte).toHaveTextContent(T.remove);
    }
    // La note du favori disponible est rendue, et éditable.
    expect(screen.getByText('Appeler lundi')).toBeInTheDocument();
  });

  it('demande la page 2 à l’API avec `page=2`', async () => {
    const user = userEvent.setup();
    monte();
    await screen.findByText('Villa Ngor');
    expect(urls[0]).toContain('/api/favorites?');
    expect(new URL(urls[0], 'http://api.test').searchParams.get('page')).toBe('1');

    await user.click(screen.getByRole('button', { name: /Suivant/ }));

    expect(await screen.findByText('Studio Mermoz')).toBeInTheDocument();
    await waitFor(() => expect(urls.some((u) => new URL(u, 'http://api.test').searchParams.get('page') === '2')).toBe(true));
    expect(screen.queryByText('Villa Ngor')).toBeNull();
  });

  it('retirer un favori éteint appelle DELETE sur l’identifiant du BIEN', async () => {
    const user = userEvent.setup();
    const appels: { url: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({ url: String(url), method: init?.method ?? 'GET' });
        if (init?.method === 'DELETE') return new Response(null, { status: 204 });
        return page([LOUE], 1, 1);
      }),
    );
    monte();
    await screen.findByText('Appartement Plateau');

    await user.click(screen.getByRole('button', { name: T.remove }));

    await waitFor(() => expect(appels.some((a) => a.method === 'DELETE')).toBe(true));
    expect(appels.find((a) => a.method === 'DELETE')?.url).toMatch(/\/api\/favorites\/11$/);
  });

  it('la note se modifie en place par PATCH /api/favorites/{bien}', async () => {
    const user = userEvent.setup();
    const appels: { url: string; method: string; body: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({ url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
        if (init?.method === 'PATCH') {
          return new Response(JSON.stringify({ data: { ...DISPONIBLE, notes: 'Visite samedi' } }), { status: 200 });
        }
        return page([DISPONIBLE], 1, 1);
      }),
    );
    monte();
    await screen.findByText('Appeler lundi');

    await user.click(screen.getByRole('button', { name: T.note.edit }));
    const champ = screen.getByLabelText(T.note.label);
    await user.clear(champ);
    await user.type(champ, 'Visite samedi');
    await user.click(screen.getByRole('button', { name: T.note.save }));

    await waitFor(() => expect(appels.some((a) => a.method === 'PATCH')).toBe(true));
    const patch = appels.find((a) => a.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/api\/favorites\/10$/);
    expect(JSON.parse(patch.body ?? '{}')).toEqual({ notes: 'Visite samedi' });
  });
});
