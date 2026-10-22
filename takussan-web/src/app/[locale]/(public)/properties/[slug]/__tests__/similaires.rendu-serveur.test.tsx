/**
 * TCK-1483 (P103.07) — les biens similaires de la fiche sont dans le HTML servi.
 *
 * Lu le 2026-10-21 : `useSimilarProperties` les demandait au navigateur, dans un `useEffect` au
 * montage ; le HTML de la fiche ne portait que quatre squelettes, aucun lien vers un autre bien.
 * Décision du porteur : les seuls similaires lus côté serveur avec la fiche, passés en données
 * initiales. Ce test rend la VRAIE page et la vraie fiche par `renderToString`, comme le serveur.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyDetail, PropertyListItem } from '@/types/property';

const lecture = vi.hoisted(() => ({
  similaires: null as PropertyListItem[] | null,
  bien: null as unknown,
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/properties/studio',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
}));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={`/fr${href}`} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));
vi.mock('../components/CompteurDeVue', () => ({ CompteurDeVue: () => null }));
vi.mock('@/lib/queries/facettes', () => ({ domainesDeLaListe: async () => null }));
vi.mock('@/lib/queries/public-property', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/public-property')>()),
  getProperty: async () => ({ etat: 'trouve', bien: lecture.bien }),
  getEtatDuBien: async () => null,
  getBiensSimilaires: async () => lecture.similaires,
}));

const { default: Page } = await import('../page');

function similaire(id: number): PropertyListItem {
  return {
    id,
    slug: `bien-similaire-${id}`,
    title: `Bien similaire ${id}`,
    price: 250000,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: 2,
    bathrooms: 1,
    area: 80,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: '2026-06-01T10:00:00Z',
    created_at: '2026-06-01T10:00:00Z',
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
    reference_number: `REF-${id}`,
    status: null,
    visibility: null,
  } as PropertyListItem;
}

const BIEN = {
  id: 7,
  reference_number: 'TK-2026-XYZ',
  title: 'Studio meublé à Parcelles Assainies',
  slug: 'studio',
  price: 250_000,
  currency: 'XOF',
  type: 'studio',
  contract_type: 'rent',
  rent_period: 'monthly',
  status: 'available',
  visibility: 'public',
  bedrooms: 1,
  bathrooms: 1,
  area: 35,
  furnished: true,
  featured: false,
  main_photo_url: null,
  published_at: '2026-08-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  type_label: 'Studio',
  contract_type_label: 'À louer',
  rent_period_label: 'Mensuel',
  status_label: 'Disponible',
  title_type: null,
  title_type_label: null,
  condition_label: null,
  floor_number: null,
  total_floors: null,
  year_built: null,
  parking_spaces: null,
  views_count: 0,
  favorites_count: 0,
  average_rating: null,
  reviews_count: 0,
  description: null,
  photos: [],
  media_extra: { videos: [], plans: [], virtual_tour_url: null },
  tags: [],
  owner: { id: 1, name: 'Fatou', avatar_url: null, is_agent: true, member_since: null },
  primary_contact: null,
  agency: null,
  documents: [],
  price_history: [],
  rejection_reason: null,
  submitted_at: null,
  approved_at: null,
  rejected_at: null,
  location: {
    full: 'Parcelles Assainies, Dakar',
    street: null,
    quarter: 'Parcelles Assainies',
    city: 'Dakar',
    region: null,
    country: null,
    postal_code: null,
    latitude: null,
    longitude: null,
  },
} as unknown as PropertyDetail;

async function htmlServi(): Promise<Document> {
  lecture.bien = BIEN;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = await Page({ params: Promise.resolve({ slug: 'studio' }) });
  const html = renderToString(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>{page}</CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('fiche de bien — similaires au rendu serveur (TCK-1483)', () => {
  it('le HTML servi porte un lien /properties/<slug> de chaque bien similaire', async () => {
    lecture.similaires = [similaire(1), similaire(2)];
    const doc = await htmlServi();

    expect(doc.querySelector('a[href="/fr/properties/bien-similaire-1"]')).not.toBeNull();
    expect(doc.querySelector('a[href="/fr/properties/bien-similaire-2"]')).not.toBeNull();
  });

  it('lecture serveur en échec : la fiche se rend quand même', async () => {
    lecture.similaires = null;
    const doc = await htmlServi();

    expect(doc.querySelector('h1')?.textContent).toContain('Studio meublé');
    expect(doc.querySelector('a[href^="/fr/properties/bien-similaire"]')).toBeNull();
  });
});
