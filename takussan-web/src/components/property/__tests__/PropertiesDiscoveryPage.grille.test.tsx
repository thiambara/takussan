import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-555 — ce que la LISTE décide pour ses cartes : sa grille, et la transaction sur laquelle
 * elle est filtrée.
 *
 * La géométrie (une colonne sous `md`, photo de 246 px de haut à 360 px) se mesure au
 * navigateur — notes du ticket. Ici on tient les deux décisions que la carte ne peut pas prendre
 * seule : elle sert aussi le carrousel de la fiche et les favoris, où aucun filtre n'existe.
 */

let parametres = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
// TCK-633 — les listes du référentiel interrogent l'API par React Query ; la page est montée ici
// sans `QueryClientProvider`.
vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({
    property,
    transactionFiltree,
    robe,
    badge,
  }: {
    property: { id: number };
    transactionFiltree?: string;
    robe?: string;
    badge?: string | null;
  }) => (
    <article
      data-testid={`carte-${property.id}`}
      data-transaction-filtree={transactionFiltree ?? ''}
      data-robe={robe}
      data-badge={badge ?? undefined}
    />
  ),
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    data: [{ id: 22, title: 'Villa', contract_type: 'rent' }],
    meta: { total: 1, per_page: 30, current_page: 1, last_page: 1 },
    search: { strategy: 'all', terms_unmatched: [], widened_total: null },
  });
});

describe('TCK-555 — la grille de /properties', () => {
  it('une colonne sous `md`, et les paliers de bureau inchangés', async () => {
    render(withIntl(<PropertiesDiscoveryPage />));
    const carte = await screen.findByTestId('carte-22');
    const classes = carte.parentElement!.className.split(/\s+/);
    // TOUS les paliers de colonnes, à l'égalité : une inclusion laissait passer un
    // `sm:grid-cols-2` (deux colonnes de 640 à 767 px, contre l'AC1) comme un `lg:grid-cols-4`
    // (le bureau change, contre la contrainte du ticket) — mutants survivants du tour 1.
    const paliers = classes.filter((c) => /(^|:)grid-cols-/.test(c)).sort();
    // Sous `md` : une colonne. À partir de `md` : les paliers d'avant TCK-555, `md:3 xl:4 2xl:5`,
    // et TCK-628 ajoute une sixième colonne au-delà de 1800 px (conteneur élargi à 1920).
    expect(paliers).toEqual([
      '2xl:grid-cols-5', 'grid-cols-1', 'md:grid-cols-3', 'min-[112.5rem]:grid-cols-6', 'xl:grid-cols-4',
    ]);
  });

  it('transmet la transaction filtrée aux cartes', async () => {
    parametres = new URLSearchParams('contract_type=rent');
    render(withIntl(<PropertiesDiscoveryPage />));
    await waitFor(() => expect(screen.getByTestId('carte-22')).toHaveAttribute('data-transaction-filtree', 'rent'));
  });

  it('ne transmet rien sans filtre de transaction', async () => {
    parametres = new URLSearchParams('');
    render(withIntl(<PropertiesDiscoveryPage />));
    expect(await screen.findByTestId('carte-22')).toHaveAttribute('data-transaction-filtree', '');
  });
});

/**
 * TCK-635 — les places payées entrent DANS la grille des résultats, à la taille des autres
 * cartes, et se distinguent par leur robe (retour du porteur du 2026-10-12). Elles restaient
 * au-dessus, dans une rangée à part, sous une étiquette.
 */
describe('TCK-635 — les places payées dans la grille', () => {
  function repondre(surcharge: Record<string, unknown> = {}) {
    mockApiFetch.mockResolvedValue({
      data: [
        { id: 22, title: 'Villa', contract_type: 'rent', placement: 'reserved', badge: null },
        { id: 23, title: 'Studio', contract_type: 'rent', placement: 'organic', badge: 'urgent' },
      ],
      sponsored: [{ id: 90, title: 'Sponsorisé', slug: 'bien-90', contract_type: 'sale', badge: null }],
      meta: { total: 2, per_page: 40, current_page: 1, last_page: 1 },
      search: { strategy: 'all', terms_unmatched: [], widened_total: null },
      ...surcharge,
    });
  }

  it('l’emplacement sponsorisé est une cellule de la grille, AVANT les biens organiques, en robe', async () => {
    parametres = new URLSearchParams('');
    repondre();
    render(withIntl(<PropertiesDiscoveryPage />));
    const organique = await screen.findByTestId('carte-22');
    const sponsor = screen.getByTestId('carte-90');
    const grille = organique.closest('[aria-busy]')!;
    expect(grille).toContainElement(sponsor);
    expect(sponsor.compareDocumentPosition(organique) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sponsor).toHaveAttribute('data-robe', 'sponsorise');
    // Les conteneurs de l'emplacement sont `contents` : chaque `<li>` est une cellule de la grille.
    const section = screen.getByRole('region', { name: 'Annonces sponsorisées' });
    expect(section.className.split(/\s+/)).toContain('contents');
    expect(section.querySelector('ul')!.className.split(/\s+/)).toContain('contents');
  });

  it('une place réservée porte la robe « vedette », un bien organique aucune ; le badge passe à la carte', async () => {
    parametres = new URLSearchParams('');
    repondre();
    render(withIntl(<PropertiesDiscoveryPage />));
    expect(await screen.findByTestId('carte-22')).toHaveAttribute('data-robe', 'vedette');
    expect(screen.getByTestId('carte-23')).not.toHaveAttribute('data-robe');
    expect(screen.getByTestId('carte-23')).toHaveAttribute('data-badge', 'urgent');
  });

  it('sans bien organique, aucun emplacement n’est rendu', async () => {
    parametres = new URLSearchParams('city=Nulle-part');
    repondre({ data: [], meta: { total: 0, per_page: 40, current_page: 1, last_page: 1 } });
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByText(/Aucun bien trouvé/);
    expect(screen.queryByTestId('carte-90')).toBeNull();
  });
});

describe('TCK-635 — la taille de page vit avec la pagination', () => {
  function repondre(lastPage: number) {
    mockApiFetch.mockResolvedValue({
      data: [{ id: 22, title: 'Villa', contract_type: 'rent' }],
      meta: { total: lastPage * 40, per_page: 40, current_page: 1, last_page: lastPage },
      search: { strategy: 'all', terms_unmatched: [], widened_total: null },
    });
  }

  it('une seule page : ni pagination ni taille de page', async () => {
    parametres = new URLSearchParams('');
    repondre(1);
    render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByTestId('carte-22');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /par page/i })).toBeNull();
  });

  it('deux pages ou plus : la taille de page est à côté de la pagination, pas dans l’en-tête', async () => {
    parametres = new URLSearchParams('');
    repondre(3);
    render(withIntl(<PropertiesDiscoveryPage />));
    const parPage = await screen.findByRole('combobox', { name: /par page/i });
    const pied = parPage.closest('[data-pied-de-liste]')!;
    expect(pied).not.toBeNull();
    expect(pied).toContainElement(screen.getByRole('navigation', { name: 'Pagination' }));
    expect(parPage.closest('[data-rangee-outils]')).toBeNull();
  });
});
