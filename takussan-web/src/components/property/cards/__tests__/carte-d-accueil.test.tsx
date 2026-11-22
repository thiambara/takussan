/**
 * TCK-2495 (AC3) — une carte d'ACCUEIL (`allegee`) ne porte pas plus de deux éléments sur sa photo :
 * une pastille et le favori. Le comparateur en sort ; la carte de la liste le garde.
 *
 * Le bien du test porte TOUT ce qui pouvait s'empiler sur la photo : une transaction, l'état « neuf »,
 * et, pour la Cover, la robe « En vedette ». Une carte qui en montrerait trois ou plus rougit.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';
import type { PropertyCardCommonProps } from '../types';
import { PropertyCardStandard } from '../PropertyCardStandard';
import { PropertyCardCover } from '../PropertyCardCover';
import { PropertyCardCompact } from '../PropertyCardCompact';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
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

const BIEN = {
  id: 77,
  slug: 'villa-neuve-a-ngor',
  title: 'Villa neuve à Ngor',
  price: 1500000,
  currency: 'XOF',
  type: 'villa',
  contract_type: 'rent',
  rent_period: 'monthly',
  condition: 'new',
  bedrooms: 4,
  bathrooms: 3,
  area: 300,
  furnished: false,
  featured: true,
  main_photo_url: 'https://picsum.photos/seed/ngor/400/300',
  published_at: '2026-11-01T10:00:00Z',
  created_at: '2026-11-01T10:00:00Z',
  location: { quarter: 'Ngor', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  reference_number: 'REF-77',
  status: null,
  visibility: null,
} as PropertyListItem;

function monte(Carte: ComponentType<PropertyCardCommonProps>, props: Partial<PropertyCardCommonProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <Carte property={BIEN} {...props} />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

/**
 * Ce qui est POSÉ sur la photo : les boutons (favori, comparateur), les pastilles (transaction, neuf)
 * et le ruban de la robe. Le texte d'une Cover est le corps de la carte, pas un élément ajouté.
 */
function elementsSurLaPhoto(container: HTMLElement): string[] {
  const photo = container.querySelector<HTMLElement>('[class*="aspect-"]');
  if (!photo) throw new Error('photo introuvable');
  const boutons = [...photo.querySelectorAll('button')].map((b) => `bouton:${b.getAttribute('aria-label') ?? ''}`);
  const pastilles = [...photo.querySelectorAll('span.rounded-full.bg-card.font-semibold')].map((p) => `pastille:${p.textContent}`);
  const rubans = [...photo.querySelectorAll('[data-ruban]')].map((r) => `ruban:${r.textContent}`);
  return [...boutons, ...pastilles, ...rubans];
}

describe('TCK-2495 — deux éléments au plus sur la photo d’une carte d’accueil', () => {
  it.each([
    ['Standard', PropertyCardStandard],
    ['Compact', PropertyCardCompact],
    ['Cover', PropertyCardCover],
  ] as const)('%s : une pastille et le favori, sans comparateur', (_nom, Carte) => {
    const { container } = monte(Carte, { allegee: true });
    const elements = elementsSurLaPhoto(container);
    expect(elements).toHaveLength(2);
    expect(elements.filter((e) => e.startsWith('bouton:'))).toHaveLength(1);
    expect(elements.join(' ')).not.toMatch(/compar/i);
  });

  it('Cover en robe « En vedette » : le ruban EST la pastille — deux éléments, pas trois', () => {
    const { container } = monte(PropertyCardCover, { allegee: true, robe: 'vedette' });
    const elements = elementsSurLaPhoto(container);
    expect(elements).toHaveLength(2);
    expect(elements.some((e) => e.startsWith('ruban:'))).toBe(true);
  });

  it('hors de l’accueil, la carte garde ses pastilles et le comparateur (témoin)', () => {
    const { container } = monte(PropertyCardStandard);
    expect(elementsSurLaPhoto(container).length).toBeGreaterThan(2);
  });
});
