/**
 * TCK-635 — la robe d'une place payée : la MÊME carte, à la même taille, habillée d'une couleur et
 * d'une mention (retour du porteur du 2026-10-12 : « la même chose, avec une robe différente »).
 *
 * ADR-0061 §7 : un résultat payé ne se présente jamais comme un résultat organique — d'où la
 * mention écrite (« Sponsorisé », « En vedette »), et pas la seule couleur.
 *
 * ⚠ jsdom ne calcule aucune mise en page : la largeur des photos et l'écart entre les cartes sont
 * mesurés au navigateur (notes du ticket : 245 px de photo et 14-15 px d'écart à 1440, robe ou
 * non). Ici on tient ce qui le PERMET : la robe ne touche ni au cadre de la photo, ni aux marges de
 * la carte — elle ne déborde pas dans la gouttière.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { withIntl } from '@/test/intl';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';
import { PropertyCard } from '../PropertyCard';
import { PropertyCardCover } from '../cards/PropertyCardCover';
import { PropertyRow } from '../cards/PropertyRow';

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

describe('PropertyCard — la robe (TCK-635)', () => {
  it.each([
    ['sponsorise', 'Sponsorisé'],
    ['vedette', 'En vedette'],
  ] as const)('robe « %s » : la couleur ET la mention « %s », sur la photo', (robe, mention) => {
    const { container } = monte(<PropertyCard property={bien(1)} robe={robe} />);
    const racine = container.querySelector(`[data-robe="${robe}"]`)!;
    expect(racine).not.toBeNull();
    expect(classes(racine)).toEqual(expect.arrayContaining(['bg-primary/8', 'outline-primary/35']));
    const ruban = racine.querySelector('[data-ruban]')!;
    expect(ruban).toHaveTextContent(mention);
    expect(racine.querySelector('[data-photo]')).toContainElement(ruban as HTMLElement);
  });

  it('une carte nue ne porte ni robe ni mention', () => {
    const { container } = monte(<PropertyCard property={bien(1)} />);
    expect(container.querySelector('[data-robe]')).toBeNull();
    expect(container.querySelector('[data-ruban]')).toBeNull();
    expect(screen.queryByText(/Sponsorisé|En vedette/)).toBeNull();
  });

  /**
   * Retour du porteur du 2026-10-12 : « l'espacement entre les biens doit être de même taille ».
   * Une première robe débordait de 6 px dans la gouttière (`-m-1.5 p-1.5`) : deux robes voisines
   * se touchaient presque. La robe vit maintenant dans la cellule : aucune marge, aucun remplissage
   * sur la racine, un liseré tracé vers l'intérieur.
   */
  it('la robe ne déborde pas dans la gouttière, et la photo garde son cadre', () => {
    const { container } = monte(
      <>
        <PropertyCard property={bien(1)} robe="vedette" />
        <PropertyCard property={bien(2)} />
      </>,
    );
    const [enRobe, nue] = [...container.querySelectorAll('[data-photo]')];
    expect(enRobe.className).toBe(nue.className);
    const robe = classes(container.querySelector('[data-robe]')!);
    expect(robe.filter((c) => /^-?(m|p)[xytrbl]?-/.test(c))).toEqual([]);
    expect(robe.filter((c) => /^(ring|border)(-|$)/.test(c))).toEqual([]);
    expect(robe).toEqual(expect.arrayContaining(['outline', '-outline-offset-1']));
  });
});

describe('PropertyCard — le Badge acheté, sur la photo (TCK-635)', () => {
  it.each([
    ['urgent', 'Urgent'],
    ['price_drop', 'Baisse de prix'],
  ] as const)('« %s » rend la pastille « %s » parmi celles de la photo', (badge, libelle) => {
    const { container } = monte(<PropertyCard property={bien(1)} badge={badge} />);
    const pastille = container.querySelector(`[data-badge-boost="${badge}"]`)!;
    expect(pastille).toHaveTextContent(libelle);
    expect(container.querySelector('[data-photo]')).toContainElement(pastille as HTMLElement);
  });

  it('sans badge, aucune pastille', () => {
    const { container } = monte(<PropertyCard property={bien(1)} />);
    expect(container.querySelector('[data-badge-boost]')).toBeNull();
  });
});

describe('PropertyCardCover — la robe de la rangée vedette (TCK-635)', () => {
  it('« En vedette » DANS le cadre de la photo (la rangée défile et rognerait ce qui déborde)', () => {
    const { container } = monte(<PropertyCardCover property={bien(1, { featured: true })} robe="vedette" />);
    const ruban = container.querySelector('[data-robe="vedette"] [data-ruban]')!;
    expect(ruban).toHaveTextContent('En vedette');
    expect(ruban.parentElement!.className).toMatch(/(^|\s)overflow-hidden(\s|$)/);
  });

  it('sans robe, rien', () => {
    const { container } = monte(<PropertyCardCover property={bien(1, { featured: true })} />);
    expect(container.querySelector('[data-robe]')).toBeNull();
  });
});

describe('PropertyRow — `robeVedette` habille les seules Vedettes actives (TCK-635)', () => {
  const BIENS = [bien(1, { featured: true }), bien(2, { featured: false })];

  it('le bien en vedette porte la robe, l’autre non', () => {
    monte(<PropertyRow variant="cover" title="Sélection" properties={BIENS} loading={false} error={null} robeVedette />);
    const vedette = screen.getByRole('link', { name: 'Bien 1' }).closest('article')!;
    const autre = screen.getByRole('link', { name: 'Bien 2' }).closest('article')!;
    expect(vedette).toHaveAttribute('data-robe', 'vedette');
    expect(within(vedette).getByText('En vedette')).toBeInTheDocument();
    expect(autre).not.toHaveAttribute('data-robe');
  });

  it('par défaut, aucune rangée n’habille ses cartes', () => {
    const { container } = monte(<PropertyRow variant="cover" title="Sélection" properties={BIENS} loading={false} error={null} />);
    expect(container.querySelector('[data-robe]')).toBeNull();
  });
});

/**
 * TCK-704 (P18.02, ADR-0061 §7 et §10) — la rangée vedette de l'accueil est un emplacement : ses
 * biens servis comptent une impression. Un clic n'est compté que si la fiche arrive marquée : sans
 * ce marqueur, ses impressions ne deviennent jamais des clics.
 *
 * TCK-794 (P18.06) — le marqueur est dans l'URL du lien (`?src=sponsored`), plus en stockage de
 * session : il suit le clic du milieu et « ouvrir dans un nouvel onglet ».
 */
describe('PropertyRow — `emplacementSponsorise` marque le lien de ses cartes (TCK-704, TCK-794)', () => {
  const BIENS = [bien(1, { featured: true }), bien(2, { featured: true })];

  it('chaque carte de la rangée mène à sa fiche avec `?src=sponsored`', () => {
    monte(<PropertyRow variant="cover" title="Sélection" properties={BIENS} loading={false} error={null} robeVedette emplacementSponsorise />);

    expect(screen.getByRole('link', { name: 'Bien 1' })).toHaveAttribute('href', '/fr/properties/bien-1?src=sponsored');
    expect(screen.getByRole('link', { name: 'Bien 2' })).toHaveAttribute('href', '/fr/properties/bien-2?src=sponsored');
  });

  it('sans l’option, la même rangée ne marque rien', () => {
    monte(<PropertyRow variant="cover" title="Sélection" properties={BIENS} loading={false} error={null} robeVedette />);

    expect(screen.getByRole('link', { name: 'Bien 2' })).toHaveAttribute('href', '/fr/properties/bien-2');
  });
});
