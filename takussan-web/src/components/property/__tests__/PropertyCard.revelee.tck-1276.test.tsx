/**
 * TCK-1276 (P102.02) — `priority` portait deux effets : sauter l'état masqué (`opacity-0`) au
 * rendu serveur, et précharger l'image. `revelee` ne porte que le premier : la grille révèle six
 * cartes sans précharger plus de quatre images.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';
import { PropertyCard } from '../PropertyCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr',
  useSearchParams: () => new URLSearchParams(''),
}));

// La photo expose ce qu'elle reçoit : `priority` décide du préchargement de l'image Next.
vi.mock('@/components/property/cards/PropertyPhoto', () => ({
  PropertyPhoto: ({ priority }: { priority?: boolean }) => <span data-image-prioritaire={priority ? 'oui' : 'non'} />,
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

function bien(id: number, surcharge: Partial<PropertyListItem> = {}): PropertyListItem {
  return {
    id,
    slug: `bien-${id}`,
    title: `Bien ${id}`,
    price: 950000,
    currency: 'XOF',
    type: 'house',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: 3,
    bathrooms: 2,
    area: 240,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: '2026-06-01T10:00:00Z',
    created_at: '2026-06-01T10:00:00Z',
    location: { quarter: 'Dieuppeul', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
    reference_number: `REF-${id}`,
    status: null,
    visibility: null,
    ...surcharge,
  } as PropertyListItem;
}

function monte(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>{ui}</CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const classes = (el: Element) => el.className.split(/\s+/);

describe('PropertyCard — révélée sans image prioritaire (TCK-1276)', () => {
  it('`revelee` seule : la carte sort visible, son image n’est pas préchargée', () => {
    const { container } = monte(<PropertyCard property={bien(1)} revelee />);
    const racine = container.querySelector('.group')!;
    expect(classes(racine)).not.toContain('opacity-0');
    expect(container.querySelector('[data-image-prioritaire]')).toHaveAttribute('data-image-prioritaire', 'non');
  });

  it('`priority` : visible et image préchargée, comme avant', () => {
    const { container } = monte(<PropertyCard property={bien(1)} priority />);
    expect(classes(container.querySelector('.group')!)).not.toContain('opacity-0');
    expect(container.querySelector('[data-image-prioritaire]')).toHaveAttribute('data-image-prioritaire', 'oui');
  });

  it('ni l’un ni l’autre : masquée jusqu’à son apparition', () => {
    const { container } = monte(<PropertyCard property={bien(1)} />);
    expect(classes(container.querySelector('.group')!)).toContain('opacity-0');
  });
});
