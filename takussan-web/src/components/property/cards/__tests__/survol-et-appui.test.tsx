/**
 * TCK-561 — retour testeur du 2026-09-23 (W1) : « Peut-on avoir une couleur un peu plus différente
 * pour le hover ? On a l'impression qu'on n'a pas cliqué. »
 *
 * Mesuré le jour même sur `/fr/properties` (1366 px, CDP) : la couleur du titre d'une carte était
 * `rgb(31, 24, 18)` au repos, au survol ET à l'appui ; le seul retour était un zoom de 5 % sur la
 * photo. Chaque carte doit désormais :
 * - changer la COULEUR ou la FORME de son titre au survol et à l'appui de son lien ;
 * - poser un voile d'interaction sur sa photo, qui ne capte aucun pointeur ;
 * - porter ces états sur une racine `group` qui CONTIENT le lien de la carte — sans quoi
 *   `group-has-[a:active]` ne verrait jamais l'appui.
 *
 * ⚠ jsdom ne calcule pas les styles des pseudo-classes : que la couleur change réellement au
 * survol se mesure au navigateur (ticket, « Contexte »). Ici on tient le câblage.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';
import type { PropertyCardCommonProps } from '../types';
import { PropertyCard } from '../../PropertyCard';
import { PropertyCardStandard } from '../PropertyCardStandard';
import { PropertyCardCover } from '../PropertyCardCover';
import { PropertyCardCompact } from '../PropertyCardCompact';
import { PropertyCardListing } from '../PropertyCardListing';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/properties',
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

const TITRE = 'Bureaux à Cité Keur Gorgui';

const BIEN = {
  id: 7373,
  slug: 'bureaux-a-cite-keur-gorgui',
  title: TITRE,
  price: 1900000,
  currency: 'XOF',
  type: 'office',
  contract_type: 'rent',
  rent_period: 'monthly',
  bedrooms: 0,
  bathrooms: 1,
  area: 433,
  furnished: false,
  featured: false,
  main_photo_url: 'https://picsum.photos/seed/biro/400/300',
  published_at: '2026-07-20T10:00:00Z',
  created_at: '2026-07-20T10:00:00Z',
  location: { quarter: 'Cité Keur Gorgui', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  reference_number: 'REF-7373',
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

/** Les classes d'un élément, en liste — pour ne tester que des jetons entiers. */
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);

// [nom, carte, le titre prend-il l'accent ? (`Cover` : blanc sur dégradé, soulignement seul)]
const CARTES: ReadonlyArray<[string, ComponentType<PropertyCardCommonProps>, boolean]> = [
  ['PropertyCard (liste)', PropertyCard, true],
  ['PropertyCardStandard', PropertyCardStandard, true],
  ['PropertyCardListing', PropertyCardListing, true],
  ['PropertyCardCompact', PropertyCardCompact, true],
  ['PropertyCardCover', PropertyCardCover, false],
];

describe.each(CARTES)('%s — survol et appui visibles (TCK-561)', (_nom, Carte, accent) => {
  it('le titre change au survol ET à l’appui du lien de la carte', () => {
    monte(Carte);
    const titre = screen.getByRole('heading', { name: TITRE });
    const c = classes(titre);

    expect(c).toContain('group-hover:underline');
    expect(c).toContain('group-has-[a:active]:underline');
    if (accent) {
      expect(c).toContain('group-hover:text-primary');
      expect(c).toContain('group-has-[a:active]:text-primary');
    }
  });

  it('les états sont portés par une racine `group` qui contient le lien de la carte', () => {
    monte(Carte);
    const titre = screen.getByRole('heading', { name: TITRE });
    const racine = titre.closest('.group');
    expect(racine).not.toBeNull();

    const lien = screen.getByRole('link', { name: TITRE });
    expect(racine!.contains(lien)).toBe(true);
    // Le seul `<a>` de la carte : l'appui du favori ou du comparateur ne la fait pas réagir.
    expect(racine!.querySelectorAll('a')).toHaveLength(1);
  });

  it('la photo porte un voile d’interaction, qui ne capte aucun pointeur', () => {
    const { container } = monte(Carte);
    const voiles = container.querySelectorAll('[data-voile-survol]');
    expect(voiles).toHaveLength(1);

    const voile = voiles[0];
    expect(voile).toHaveAttribute('aria-hidden', 'true');
    const c = classes(voile);
    expect(c).toContain('pointer-events-none');
    expect(c).toContain('group-hover:bg-scrim/10');
    expect(c).toContain('group-has-[a:active]:bg-scrim/25');
    // Posé sur la photo : il partage son conteneur avec l'image.
    expect(voile.parentElement!.querySelector('img')).not.toBeNull();
  });
});
