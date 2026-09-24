/**
 * TCK-561 — retour testeur du 2026-09-23 (W7) : « Pourquoi “ajouter au comparateur” n'est pas
 * dispo sur cette page ? » — l'accueil public.
 *
 * Les quatre variantes de `PropertyRow` (carrousels de l'accueil, récemment consultés) ne portaient
 * que le cœur ; la carte de la liste (`PropertyCard`) porte le cœur ET le comparateur. Chaque
 * variante doit désormais permettre d'ajouter le bien au comparateur — et l'ajout doit ÉCRIRE la
 * sélection, avec l'aperçu qui permet à la barre flottante de nommer le bien.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { COMPARE_STORAGE_KEY } from '@/lib/compare';
import type { PropertyListItem } from '@/types/property';
import type { PropertyCardCommonProps } from '../types';
import { PropertyCardStandard } from '../PropertyCardStandard';
import { PropertyCardCover } from '../PropertyCardCover';
import { PropertyCardCompact } from '../PropertyCardCompact';
import { PropertyCardListing } from '../PropertyCardListing';

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

const TITRE = 'Maison de standing à Point E';

const BIEN = {
  id: 5151,
  slug: 'maison-de-standing-a-point-e',
  title: TITRE,
  price: 2140000,
  currency: 'XOF',
  type: 'house',
  contract_type: 'rent',
  rent_period: 'monthly',
  bedrooms: 4,
  bathrooms: 3,
  area: 300,
  furnished: false,
  featured: false,
  main_photo_url: 'https://picsum.photos/seed/pointe/400/300',
  published_at: '2026-08-20T10:00:00Z',
  created_at: '2026-08-20T10:00:00Z',
  location: { quarter: 'Point E', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  reference_number: 'REF-5151',
  status: null,
  visibility: null,
} as PropertyListItem;

function monte(Carte: ComponentType<PropertyCardCommonProps>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <Carte property={BIEN} />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

function selectionEnStockage(): { ids: number[]; previews: Record<string, { title: string }> } {
  const brut = localStorage.getItem(COMPARE_STORAGE_KEY);
  return brut ? JSON.parse(brut) : { ids: [], previews: {} };
}

const VARIANTES: ReadonlyArray<[string, ComponentType<PropertyCardCommonProps>]> = [
  ['PropertyCardStandard', PropertyCardStandard],
  ['PropertyCardCover', PropertyCardCover],
  ['PropertyCardCompact', PropertyCardCompact],
  ['PropertyCardListing', PropertyCardListing],
];

describe.each(VARIANTES)('%s — ajouter au comparateur depuis l’accueil (TCK-561)', (_nom, Carte) => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('porte UN bouton « Ajouter au comparateur », hors du lien de la carte', () => {
    monte(Carte);
    const boutons = screen.getAllByRole('button', { name: /ajouter au comparateur/i });
    expect(boutons).toHaveLength(1);
    expect(boutons[0].closest('a')).toBeNull();
    expect(boutons[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('ajoute le bien à la sélection, avec son titre pour la barre flottante', () => {
    monte(Carte);
    fireEvent.click(screen.getByRole('button', { name: /ajouter au comparateur/i }));

    const selection = selectionEnStockage();
    expect(selection.ids).toEqual([BIEN.id]);
    expect(selection.previews[String(BIEN.id)]?.title).toBe(TITRE);
    expect(screen.getByRole('button', { name: /retirer du comparateur/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
