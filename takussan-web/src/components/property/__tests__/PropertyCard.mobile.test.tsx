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
 * Les éléments POSÉS sur la photo, comptés sans liste nominative : tout rond (`rounded-full` —
 * pastilles, boutons, bulle d'ancienneté) qui n'est pas contenu dans un autre rond. Le point
 * coloré d'une pastille est dans sa pastille : il ne compte pas. Une surimpression neuve, de
 * quelque nature qu'elle soit, compte — sans que personne l'ait déclarée ici.
 */
function surimpressions(photo: HTMLElement): HTMLElement[] {
  const ronds = [...photo.querySelectorAll<HTMLElement>('.rounded-full')];
  return ronds.filter((el) => !ronds.some((autre) => autre !== el && autre.contains(el)));
}

describe('TCK-555 — surimpressions de la photo', () => {
  it('au plus deux éléments sur la photo : la pastille de transaction et le favori', () => {
    const { photo } = monte();
    const posees = surimpressions(photo);
    expect(posees).toHaveLength(2);
    expect(within(photo).getByText('En location')).toBeInTheDocument();
    expect(within(photo).getByRole('button', { name: /ajouter aux favoris/i })).toBeInTheDocument();
  });

  it('le comparateur reste sur la carte, mais hors de la photo', () => {
    const { photo } = monte();
    const comparateur = screen.getByRole('button', { name: /ajouter au comparateur/i });
    expect(photo.contains(comparateur)).toBe(false);
  });

  it("l'ancienneté quitte la photo et reste lisible, en texte, dans la ligne de détails", () => {
    const { photo } = monte();
    expect(within(photo).queryByText(/il y a/)).not.toBeInTheDocument();
    const age = screen.getByText('il y a 3 mois');
    // Dans la même ligne que « 3 Ch. • 240 m² » — la ligne de détails, pas un élément à part.
    expect(age.parentElement).toHaveTextContent(/3 Ch\..*240 m².*il y a 3 mois/);
  });

  it('un bien « Neuf » ne fait pas une troisième surimpression : l’état passe dans les détails', () => {
    const { photo } = monte({ condition: 'new' });
    expect(surimpressions(photo)).toHaveLength(2);
    expect(within(photo).getByText('En location')).toBeInTheDocument();
    expect(within(photo).queryByText('Neuf')).not.toBeInTheDocument();
    expect(screen.getByText('Neuf').parentElement).toHaveTextContent(/Neuf.*3 Ch\./);
  });

  it('sous filtre de transaction, la pastille « Neuf » reprend la place laissée libre', () => {
    const { photo } = monte({ condition: 'new' }, { transactionFiltree: 'rent' });
    expect(surimpressions(photo)).toHaveLength(2);
    expect(within(photo).getByText('Neuf')).toBeInTheDocument();
    // Et l'état n'est pas dit deux fois.
    expect(screen.getAllByText('Neuf')).toHaveLength(1);
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
});
