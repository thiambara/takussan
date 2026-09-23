/**
 * TCK-555 — la carte de bien sur mobile : une photo qui porte au plus deux choses, et un texte qui
 * dit tout le reste.
 *
 * Relevé de l'audit du 2026-09-22 (re-mesuré le 2026-09-23 à 360 px) : photo de 156 × 117 px sur
 * laquelle se posaient QUATRE éléments — pastille de transaction, favori, comparateur, « il y a X
 * mois ». Et un loyer sans période s'affichait comme un prix de vente.
 *
 * ⚠ jsdom ne calcule aucune mise en page : la hauteur de la photo, l'écart entre les zones
 * tactiles du favori et du comparateur, la grille à une colonne se mesurent au navigateur (notes
 * du ticket). Ici on tient la STRUCTURE : ce qui est posé sur la photo, et ce qui ne l'est pas.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { formatPrice } from '@/lib/utils';
import { CompareProvider } from '@/context/CompareContext';
import { ToastProvider } from '@/components/ui/toast';
import type { PropertyListItem } from '@/types/property';
import { PropertyCard, type PropertyCardProps } from '../PropertyCard';

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

beforeEach(() => {
  localStorage.clear();
});

const BASE: PropertyListItem = {
  id: 4242,
  slug: 'villa-luxueuse-a-dieuppeul',
  title: 'Villa luxueuse à Dieuppeul',
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
  // Cent jours avant « maintenant » : « il y a 3 mois », quelle que soit la date d'exécution.
  published_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
  created_at: new Date(Date.now() - 100 * 86_400_000).toISOString(),
  location: { quarter: 'Dieuppeul', city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
  reference_number: 'REF-1',
  status: null,
  visibility: null,
} as PropertyListItem;

function monte(bien: Partial<PropertyListItem> = {}, props: Partial<PropertyCardProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendu = render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <CompareProvider>
            <PropertyCard property={{ ...BASE, ...bien }} {...props} />
          </CompareProvider>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
  const photo = rendu.container.querySelector<HTMLElement>('[data-photo]');
  if (!photo) throw new Error('la carte ne marque plus sa photo (`data-photo`)');
  return { ...rendu, photo };
}

/**
 * Ce qu'une largeur d'écran MONTRE, lu sur les classes — jsdom ne charge aucune feuille de style.
 *
 * TCK-555, tour 2 — la carte a DEUX dispositions : sous `md` (téléphone), la photo porte au plus
 * deux choses ; à partir de `md`, la carte de bureau est INCHANGÉE (contrainte du ticket). Le
 * premier tour appliquait la disposition mobile à toutes les largeurs : sur les emplacements de
 * 192 px du bureau, le prix passait à la ligne sur 17 cartes sur 30 et la ligne de détails
 * laissait une puce pendante sur 24. Ce qui ne vaut que d'un côté porte donc `md:hidden` (visible
 * sous `md` seulement) ou `hidden md:<affichage>` (visible à partir de `md` seulement).
 */
const AFFICHAGE_DES_MD = /(^|\s)md:(flex|inline-flex|block|inline|contents|grid)(\s|$)/;

function classes(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/);
}

function visible(el: HTMLElement, largeur: 'mobile' | 'bureau'): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const c = classes(n);
    if (largeur === 'mobile' && (c.includes('hidden') || c.includes('max-md:hidden'))) return false;
    if (largeur === 'bureau') {
      if (c.includes('md:hidden')) return false;
      if (c.includes('hidden') && !AFFICHAGE_DES_MD.test(n.getAttribute('class') ?? '')) return false;
    }
  }
  return true;
}

/**
 * Les éléments POSÉS sur la photo, comptés sans liste nominative : tout rond (`rounded-full` —
 * pastilles, boutons, bulle d'ancienneté) qui n'est pas contenu dans un autre rond, et que la
 * largeur montre. Le point coloré d'une pastille est dans sa pastille : il ne compte pas. Une
 * surimpression neuve, de quelque nature qu'elle soit, compte — sans que personne l'ait déclarée.
 */
function surimpressions(photo: HTMLElement, largeur: 'mobile' | 'bureau' = 'mobile'): HTMLElement[] {
  const ronds = [...photo.querySelectorAll<HTMLElement>('.rounded-full')].filter((el) => visible(el, largeur));
  return ronds.filter((el) => !ronds.some((autre) => autre !== el && autre.contains(el)));
}

/** Les éléments dont le texte vaut `texte` exactement, et que la largeur montre. */
function textesVisibles(racine: HTMLElement, texte: string | RegExp, largeur: 'mobile' | 'bureau'): HTMLElement[] {
  return within(racine)
    .queryAllByText(texte)
    .filter((el) => visible(el, largeur));
}

const COMPARATEUR = /ajouter au comparateur/i;

describe('TCK-555 — sous `md`, la photo porte au plus deux éléments', () => {
  it('la pastille de transaction et le favori, rien d’autre', () => {
    const { photo } = monte();
    const posees = surimpressions(photo);
    expect(posees).toHaveLength(2);
    expect(textesVisibles(photo, 'En location', 'mobile')).toHaveLength(1);
    expect(visible(within(photo).getByRole('button', { name: /ajouter aux favoris/i }), 'mobile')).toBe(true);
  });

  it('le comparateur reste sur la carte, mais hors de la photo', () => {
    const { photo, container } = monte();
    const montres = screen.getAllByRole('button', { name: COMPARATEUR }).filter((b) => visible(b, 'mobile'));
    // UN comparateur à l'écran, pas deux, et pas sur la photo.
    expect(montres).toHaveLength(1);
    expect(photo.contains(montres[0])).toBe(false);
    expect(container.contains(montres[0])).toBe(true);
  });

  it("l'ancienneté quitte la photo et reste lisible, en texte, dans la ligne de détails", () => {
    const { photo, container } = monte();
    expect(textesVisibles(photo, /il y a/, 'mobile')).toHaveLength(0);
    const ages = textesVisibles(container, 'il y a 3 mois', 'mobile');
    expect(ages).toHaveLength(1);
    // Dans la même ligne que « 3 Ch. • 240 m² » — la ligne de détails, pas un élément à part.
    expect(ages[0].parentElement).toHaveTextContent(/3 Ch\..*240 m².*il y a 3 mois/);
  });

  it('un bien « Neuf » ne fait pas une troisième surimpression : l’état passe dans les détails', () => {
    const { photo, container } = monte({ condition: 'new' });
    expect(surimpressions(photo)).toHaveLength(2);
    expect(textesVisibles(photo, 'En location', 'mobile')).toHaveLength(1);
    expect(textesVisibles(photo, 'Neuf', 'mobile')).toHaveLength(0);
    const neuf = textesVisibles(container, 'Neuf', 'mobile');
    expect(neuf).toHaveLength(1);
    expect(neuf[0].parentElement).toHaveTextContent(/Neuf.*3 Ch\./);
  });

  it('sous filtre de transaction, la pastille « Neuf » reprend la place laissée libre', () => {
    const { photo, container } = monte({ condition: 'new' }, { transactionFiltree: 'rent' });
    expect(surimpressions(photo)).toHaveLength(2);
    expect(textesVisibles(photo, 'Neuf', 'mobile')).toHaveLength(1);
    // Et l'état n'est dit qu'une fois, à chaque largeur.
    expect(textesVisibles(container, 'Neuf', 'mobile')).toHaveLength(1);
    expect(textesVisibles(container, 'Neuf', 'bureau')).toHaveLength(1);
  });
});

describe('TCK-555 — à partir de `md`, la carte de bureau est inchangée', () => {
  it('la photo porte ce qu’elle portait : transaction, favori, comparateur, ancienneté', () => {
    const { photo } = monte();
    expect(surimpressions(photo, 'bureau')).toHaveLength(4);
    expect(textesVisibles(photo, 'En location', 'bureau')).toHaveLength(1);
    expect(textesVisibles(photo, 'il y a 3 mois', 'bureau')).toHaveLength(1);
    const comparateurs = within(photo)
      .getAllByRole('button', { name: COMPARATEUR })
      .filter((b) => visible(b, 'bureau'));
    expect(comparateurs).toHaveLength(1);
  });

  it('un seul comparateur à l’écran, celui de la photo — la rangée du prix n’en porte pas', () => {
    const { photo } = monte();
    const montres = screen.getAllByRole('button', { name: COMPARATEUR }).filter((b) => visible(b, 'bureau'));
    expect(montres).toHaveLength(1);
    expect(photo.contains(montres[0])).toBe(true);
  });

  it('la ligne de détails ne porte ni l’ancienneté ni l’état : ils sont sur la photo', () => {
    const { container, photo } = monte({ condition: 'new' });
    expect(textesVisibles(container, 'il y a 3 mois', 'bureau').every((el) => photo.contains(el))).toBe(true);
    const neuf = textesVisibles(container, 'Neuf', 'bureau');
    expect(neuf).toHaveLength(1);
    expect(photo.contains(neuf[0])).toBe(true);
    // Les deux pastilles côte à côte, comme avant.
    expect(surimpressions(photo, 'bureau')).toHaveLength(5);
  });

  it('la rangée du prix redevient un bloc : le prix dispose de toute la largeur', () => {
    const { container } = monte();
    const rangee = container.querySelector('[data-prix]')!.parentElement!;
    expect(classes(rangee)).toContain('md:block');
  });
});

describe('TCK-555 — pastille de transaction sous filtre', () => {
  it('masquée quand la liste est filtrée sur la transaction du bien', () => {
    const { photo } = monte({}, { transactionFiltree: 'rent' });
    expect(screen.queryByText('En location')).not.toBeInTheDocument();
    expect(surimpressions(photo)).toHaveLength(1);
  });

  it('affichée sans filtre — le défaut, pour toutes les autres surfaces de la carte', () => {
    monte();
    expect(screen.getByText('En location')).toBeInTheDocument();
  });

  it('affichée quand le filtre ne correspond pas au bien : la pastille dit alors une vraie différence', () => {
    monte({ contract_type: 'sale', rent_period: null }, { transactionFiltree: 'rent' });
    expect(screen.getByText('En vente')).toBeInTheDocument();
  });
});

describe('TCK-555 — le prix', () => {
  it('un loyer sans période ne se lit pas comme un prix de vente', () => {
    const { container: loyer } = monte({ rent_period: null });
    const prixLoyer = loyer.querySelector('[data-prix]')?.textContent;
    loyer.remove();

    const { container: vente } = monte({ contract_type: 'sale', rent_period: null });
    const prixVente = vente.querySelector('[data-prix]')?.textContent;

    // Témoin : une vente affiche le montant nu — sinon l'inégalité ci-dessous ne dirait rien.
    expect(prixVente).toBe(formatPrice(950000, 'XOF'));
    expect(prixLoyer).not.toBe(prixVente);
    expect(prixLoyer).toMatch(/loyer/);
  });

  it('le suffixe est séparé du montant dans le TEXTE, pas seulement à l’écran', () => {
    // Un lecteur d'écran lisait « F CFA· loyer » : l'espace n'existait que par une marge.
    const { container } = monte({ rent_period: null });
    expect(container.querySelector('[data-prix]')?.textContent).toMatch(/CFA[\s\u00a0\u202f]+· loyer$/);
  });

  it('un loyer avec période garde sa période', () => {
    const { container } = monte();
    expect(container.querySelector('[data-prix]')).toHaveTextContent(/\/mois$/);
  });
});

describe('TCK-555 — hauteur du titre', () => {
  it("ne réserve pas deux lignes quand la carte est seule sur sa rangée (sous `sm`)", () => {
    monte();
    const titre = screen.getByRole('heading', { name: BASE.title });
    // `h-10` sans préfixe réservait 40 px sous un titre d'une ligne à toutes les largeurs.
    expect(titre.className).not.toMatch(/(^|\s)h-10(\s|$)/);
    // Là où des cartes voisines s'alignent (grilles à deux colonnes et plus), la réserve reste.
    expect(titre.className).toMatch(/(^|\s)sm:h-10(\s|$)/);
  });

  it('réserve deux lignes à toutes les largeurs quand l’appelant aligne des cartes voisines', () => {
    // Le carrousel des biens similaires montre la diapositive suivante à côté de la courante,
    // à toutes les largeurs : sans réserve, prix et détails s'y décalaient de 20 px.
    monte({}, { titreSurDeuxLignes: 'toujours' });
    const titre = screen.getByRole('heading', { name: BASE.title });
    expect(titre.className).toMatch(/(^|\s)h-10(\s|$)/);
  });
});
