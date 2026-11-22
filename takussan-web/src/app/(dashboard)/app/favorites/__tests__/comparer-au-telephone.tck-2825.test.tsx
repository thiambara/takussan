/**
 * TCK-2825 — « Comparer » sur une carte de `/app/favorites`, au téléphone, mène au comparatif.
 *
 * Sous `lg`, le comparateur est une PASTILLE (TCK-2493, ADR-0091 § 4) posée au-dessus de la barre
 * d'onglets. Elle s'effaçait partout hors de la barre PUBLIQUE, donc sous tout `/app` : le bouton
 * changeait d'état, et rien d'autre. Sous `/app`, elle se pose désormais au-dessus de la barre
 * d'onglets de la COQUE (le décalage vient de `[data-barre-onglets]`, `globals.css`), et s'efface là
 * où la coque n'en a pas (plein écran).
 *
 * Éprouvé sur la ROUTE entière : le layout (qui monte `CompareProvider` et `CompareFloatingBar`) et la
 * page, montés comme Next les rend — sans le layout, le bouton n'a pas de comparateur à remplir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { COMPARE_STORAGE_KEY } from '@/lib/compare';

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
// La frontière de dictionnaire du layout lit `next-intl/server` : `withIntl` sert déjà tout `fr.json`.
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({ IntlProvider: ({ children }: { children: React.ReactNode }) => children }));

const { default: Layout } = await import('../layout');
const { default: PageDesFavoris } = await import('../page');

const C = fr.navigationPublique.comparateur;

const DISPONIBLE = {
  id: 1,
  property_id: 10,
  user_id: 1,
  notes: null,
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

const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** La largeur simulée : `true` = sous `lg` (`(width < 64rem)`, la requête de la pastille). */
let sousLg = true;
const matchMediaDOrigine = window.matchMedia;

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
  sessionStorage.clear();
  sousLg = true;
  window.matchMedia = ((query: string) => ({
    matches: sousLg && query === '(width < 64rem)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      const url = new URL(String(u), 'http://api.test');
      if (url.pathname === '/api/favorites') return json({ data: [DISPONIBLE], meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 } });
      return json({ data: [], meta: { total: 0 } });
    }),
  );
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
  vi.unstubAllGlobals();
});

async function monterLaRoute(chemin = '/app/favorites') {
  etat.chemin = chemin;
  const element = await Layout({ children: await PageDesFavoris() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{element}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const boutonComparer = () => screen.findByRole('button', { name: fr.compare.button.add });

describe('TCK-2825 — sous `lg`, « Comparer » sur un favori de `/app` rend la pastille du comparateur', () => {
  it('AC1 — toucher « Comparer » : la pastille paraît et mène au comparatif', async () => {
    const user = userEvent.setup();
    await monterLaRoute();
    expect(document.querySelector('[data-pastille-comparateur]')).toBeNull();

    await user.click(await boutonComparer());

    const lien = await screen.findByRole('link', { name: C.aria.replace('{count}', '1') });
    expect(lien).toHaveAttribute('href', '/fr/compare');
    expect(lien.closest('[data-pastille-comparateur]')).not.toBeNull();
    // La pastille, pas le dock de bureau (ses vignettes, « Vider »).
    expect(screen.queryByText(/biens sélectionnés sur 4/)).toBeNull();
  });

  it('deux biens déjà choisis : la pastille porte leur comparatif', async () => {
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify({ ids: [10, 11], previews: {}, updated_at: Date.now() }));
    await monterLaRoute();
    const lien = await screen.findByRole('link', { name: C.aria.replace('{count}', '2') });
    expect(lien).toHaveAttribute('href', '/fr/compare?ids=10,11');
  });

  it('en plein écran de la coque (pas de barre d’onglets), la pastille s’efface', async () => {
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify({ ids: [10, 11], previews: {}, updated_at: Date.now() }));
    await monterLaRoute('/app/properties/new');
    await screen.findByText(/Villa Ngor/);
    await act(async () => {});
    expect(document.querySelector('[data-pastille-comparateur]')).toBeNull();
  });

  it('AC4 — en bureau, le dock de `/app/favorites` est inchangé (pas de pastille)', async () => {
    sousLg = false;
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify({ ids: [10, 11], previews: {}, updated_at: Date.now() }));
    await monterLaRoute();
    expect(await screen.findByText(/2 biens sélectionnés sur 4/)).toBeInTheDocument();
    expect(document.querySelector('[data-pastille-comparateur]')).toBeNull();
  });
});
