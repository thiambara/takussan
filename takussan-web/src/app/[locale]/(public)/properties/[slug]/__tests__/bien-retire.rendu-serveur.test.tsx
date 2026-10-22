/**
 * La page d'un bien loué, vendu ou retiré, EN RENDU SERVEUR, avec la VRAIE `PropertyCard`.
 *
 * `page.server.test.tsx` remplace la carte par un `<article>` : il garde ce que la page rend, pas
 * ce que la carte en fait. Ce fichier-ci rend le HTML que reçoit le lecteur d'un lien circulant sur
 * WhatsApp avant l'hydratation (`renderToString`, donc sans aucun effet) :
 *
 *   · TCK-1188 (P102.01) — les cartes de la première rangée ne sortent pas en `opacity-0` : la
 *     carte ne se dévoile que dans l'`IntersectionObserver` d'un `useEffect`, et une carte
 *     `priority` saute cet état (contrat écrit dans `PropertyCard`).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';

import { bienRetire, type EtatRetire } from '../bien-retire';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr',
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

function similaire(id: number): PropertyListItem {
  return {
    id,
    slug: `bien-${id}`,
    title: `Bien ${id}`,
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
    main_photo_url: `https://picsum.photos/seed/${id}/800/600`,
    published_at: '2026-06-01T10:00:00Z',
    created_at: '2026-06-01T10:00:00Z',
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
    reference_number: `REF-${id}`,
    status: null,
    visibility: null,
  } as PropertyListItem;
}

function etat(nombre: number): EtatRetire {
  return {
    state: 'rented',
    contract_type: 'rent',
    type: 'apartment',
    location: { city: 'Dakar', quarter: 'Mermoz' },
    similar: Array.from({ length: nombre }, (_, i) => similaire(i + 1)),
  } as unknown as EtatRetire;
}

async function htmlServi(nombre: number): Promise<Document> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToString(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>{await bienRetire(etat(nombre))}</CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Les racines de carte : l'élément qui porte le délai d'apparition échelonnée. */
function racines(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll('div.group.relative'));
}

const masquee = (el: Element) => el.className.split(/\s+/).includes('opacity-0');

describe('TCK-1188 — les cartes de la première rangée ne sont pas masquées au rendu serveur', () => {
  it('les trois premières cartes sortent visibles, la quatrième garde son apparition', async () => {
    const cartes = racines(await htmlServi(4));

    expect(cartes).toHaveLength(4);
    expect(cartes.slice(0, 3).map(masquee)).toEqual([false, false, false]);
    expect(masquee(cartes[3])).toBe(true);
  });

  it('leurs images ne sont pas différées', async () => {
    const images = Array.from((await htmlServi(3)).querySelectorAll('img'));

    expect(images).toHaveLength(3);
    for (const image of images) expect(image.getAttribute('loading')).not.toBe('lazy');
  });
});
