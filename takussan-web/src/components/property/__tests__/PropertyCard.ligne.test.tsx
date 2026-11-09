/**
 * TCK-2499 — la carte en disposition « ligne » (densité « Liste » de `/properties`) : UN élément
 * par bien, posé en ligne sous `md` par le CSS, et la carte de bureau inchangée à partir de `md`.
 *
 * ⚠ jsdom ne charge aucune feuille de style : ce qu'une largeur MONTRE se lit sur les classes
 * (`max-md:hidden`, `md:hidden`, `hidden md:…`), comme dans `PropertyCard.mobile.test.tsx`. La
 * géométrie (photo de 112 px, quatre lignes par écran à 390 px) se mesure au navigateur.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import { CARD_SIZES_SEARCH_GRID } from '@/components/property/card-image-sizes';
import type { PropertyListItem } from '@/types/property';
import { PropertyCard, type PropertyCardProps } from '../PropertyCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, isLoading: false }) }));
// La photo : seul le `sizes` annoncé à `next/image` compte ici.
vi.mock('@/components/property/cards/PropertyPhoto', () => ({
  PropertyPhoto: ({ sizes }: { sizes?: string }) => <span data-photo-sizes={sizes} />,
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

beforeEach(() => localStorage.clear());

const ILYA = (heures: number) => new Date(Date.now() - heures * 3_600_000).toISOString();

const BASE = {
  id: 4242,
  slug: 'villa-a-mermoz',
  title: 'Villa à Mermoz',
  price: 950000,
  currency: 'XOF',
  type: 'house',
  contract_type: 'rent',
  rent_period: 'monthly',
  bedrooms: 3,
  area: 240,
  main_photo_url: 'https://picsum.photos/400/300',
  published_at: ILYA(24 * 100),
  created_at: ILYA(24 * 100),
  location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
} as unknown as PropertyListItem;

function monte(bien: Partial<PropertyListItem> = {}, props: Partial<PropertyCardProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendu = render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <PropertyCard property={{ ...BASE, ...bien }} sizes={CARD_SIZES_SEARCH_GRID} disposition="ligne-au-telephone" {...props} />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
  const carte = rendu.container.firstElementChild as HTMLElement;
  const photo = carte.querySelector<HTMLElement>('[data-photo]')!;
  return { ...rendu, carte, photo };
}

const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
const AFFICHAGE_DES_MD = /(^|\s)md:(flex|inline-flex|block|inline|contents|grid)(\s|$)/;

/** Ce que la largeur montre, lu sur les classes de l'élément et de ses ancêtres. */
function visible(el: Element, largeur: 'telephone' | 'bureau'): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = classes(n);
    if (largeur === 'telephone' && (c.includes('hidden') || c.includes('max-md:hidden'))) return false;
    if (largeur === 'bureau') {
      if (c.includes('md:hidden')) return false;
      if (c.includes('hidden') && !AFFICHAGE_DES_MD.test(n.getAttribute('class') ?? '')) return false;
    }
  }
  return true;
}

const visiblesDans = (racine: Element, selecteur: string, largeur: 'telephone' | 'bureau') =>
  [...racine.querySelectorAll(selecteur)].filter((el) => visible(el, largeur));

describe('PropertyCard — disposition « ligne » au téléphone (TCK-2499)', () => {
  it('un seul élément : une seule photo, un seul titre, un seul lien', () => {
    const { container, carte } = monte();
    expect(carte).toHaveAttribute('data-disposition', 'ligne-au-telephone');
    expect(container.querySelectorAll('[data-photo]')).toHaveLength(1);
    expect(container.querySelectorAll('h3')).toHaveLength(1);
    expect(container.querySelectorAll('a')).toHaveLength(1);
    // En ligne sous `md` : la photo à gauche, le texte à droite.
    expect(classes(carte)).toEqual(expect.arrayContaining(['max-md:flex', 'max-md:gap-3']));
  });

  it('la photo annonce 112 px à `next/image` sous `md`, la largeur de la grille au-delà', () => {
    const { container } = monte();
    const sizes = container.querySelector('[data-photo-sizes]')!.getAttribute('data-photo-sizes')!;
    // Sans ce préfixe, un téléphone télécharge la photo à la largeur de l'écran pour une vignette.
    expect(sizes).toBe(`(max-width: 767px) 112px, ${CARD_SIZES_SEARCH_GRID}`);
  });

  it('rien sur la photo au téléphone ; le favori en bout de ligne, hors de la photo', () => {
    const { photo, carte } = monte({ contract_type: 'sale', rent_period: null }, { robe: 'sponsorise', badge: 'urgent', transactionFiltree: 'rent' });
    // Ni pastille (transaction, Badge), ni bouton, ni ruban, ni texte : la photo seule.
    expect(visiblesDans(photo, '.rounded-full, button, [data-ruban]', 'telephone')).toEqual([]);
    expect(
      [...photo.querySelectorAll('*')].filter((el) => visible(el, 'telephone') && (el.textContent ?? '').trim() !== ''),
    ).toEqual([]);
    const favoris = visiblesDans(carte, 'button[aria-label*="favoris" i]', 'telephone');
    expect(favoris).toHaveLength(1);
    expect(photo.contains(favoris[0])).toBe(false);
  });

  it('la place payée et le Badge en TEXTE dans la ligne ; ruban et pastille au bureau', () => {
    const { carte, photo } = monte({}, { robe: 'sponsorise', badge: 'urgent' });
    const meta = carte.querySelector('[data-meta]')!;
    expect(visible(meta, 'telephone')).toBe(true);
    expect(visible(meta, 'bureau')).toBe(false);
    expect(meta.querySelector('[data-mention-payee]')).toHaveTextContent('Sponsorisé');
    expect(meta.querySelector('[data-badge-texte="urgent"]')).not.toBeNull();
    // Au bureau, la carte d'avant : le ruban et la pastille sur la photo, le favori à la même place.
    expect(visiblesDans(photo, '[data-ruban]', 'bureau')).toHaveLength(1);
    expect(visiblesDans(photo, '[data-badge-boost="urgent"]', 'bureau')).toHaveLength(1);
    expect(visiblesDans(carte, 'button[aria-label*="favoris" i]', 'bureau')).toHaveLength(1);
  });

  it('« Nouveau » d’un bien publié il y a moins de 48 h ; « Publié … » au-delà', () => {
    const recent = monte({ published_at: ILYA(5) });
    expect(recent.carte.querySelector('[data-nouveau]')).toHaveTextContent(/^Nouveau · /);
    recent.unmount();

    const ancien = monte({ published_at: ILYA(50) });
    expect(ancien.carte.querySelector('[data-nouveau]')).toBeNull();
    expect(ancien.carte.querySelector('[data-meta]')).toHaveTextContent(/^Publié /);
  });

  it('au téléphone, le lieu, les chambres et la surface sur une ligne ; la ligne de bureau masquée', () => {
    const { carte } = monte();
    const lignes = within(carte).getAllByText(/Mermoz, Dakar/).filter((el) => visible(el, 'telephone'));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].textContent).toBe('Mermoz, Dakar · 3 ch · 240 m²');
  });

  it('sans disposition (galerie, accueil, favoris), la carte est celle d’avant', () => {
    const { carte, photo } = monte({}, { disposition: undefined, robe: 'sponsorise' });
    expect(carte).not.toHaveAttribute('data-disposition');
    expect(carte.querySelector('[data-meta]')).toBeNull();
    expect(carte.querySelector('[data-photo-sizes]')!.getAttribute('data-photo-sizes')).toBe(CARD_SIZES_SEARCH_GRID);
    // Le favori sur la photo, à toutes les largeurs.
    expect(visiblesDans(photo, 'button[aria-label*="favoris" i]', 'telephone')).toHaveLength(1);
    expect(visiblesDans(photo, '[data-ruban]', 'telephone')).toHaveLength(1);
  });
});
