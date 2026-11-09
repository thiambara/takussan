import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { clefDeRecherche, parametresDeRecherche } from '@/lib/recherche-publique';
import { CLE_DENSITE, oublierDensite } from '@/components/property/liste/densite';
import { DUREE_DE_VIE_MS, LISTES_GARDEES, PREFIXE_DE_LA_SUITE } from '@/components/property/liste/suite';

/**
 * TCK-2499 — deux densités, « Voir N biens de plus » et le retour arrière à la même place ;
 * TCK-2500 — les emplacements sponsorisés insérés à la position que l'API rend.
 *
 * La géométrie (quatre biens par écran à 390 px, le 30ᵉ bien à l'écran au retour) se mesure au
 * navigateur : jsdom ne met rien en page. Ce fichier garde ce qui la rend possible — la densité par
 * défaut et mémorisée, les pages chargées et leur reprise sur la même entrée d'historique, l'ordre
 * des cellules.
 */

let parametres = new URLSearchParams('contract_type=rent');
const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));
// La carte elle-même (et sa disposition « ligne ») est éprouvée par `PropertyCard.ligne.test.tsx`.
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property, robe, disposition }: { property: { id: number }; robe?: string; disposition?: string }) => (
    <article data-testid={`carte-${property.id}`} data-robe={robe} data-disposition={disposition} />
  ),
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';
import type { SearchResult } from '@/types/search';

const bien = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Bien ${id}`,
  slug: `bien-${id}`,
  price: 500_000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'monthly',
  location: { quarter: 'Mermoz', city: 'Dakar' },
  bedrooms: 2,
  area: 80,
  main_photo_url: null,
  published_at: '2026-10-01T10:00:00Z',
  created_at: '2026-10-01T10:00:00Z',
  ...extra,
});

/** Une page de `n` biens à partir de `premier`, et ses emplacements. */
function page(numero: number, ids: number[], sponsored: { id: number; position?: number }[] = [], total = 60) {
  return {
    data: ids.map((id) => bien(id)),
    sponsored: sponsored.map(({ id, position }) => ({ ...bien(id), ...(position === undefined ? {} : { position }) })),
    meta: { total, per_page: 25, current_page: numero, last_page: Math.ceil(total / 25) },
    search: { strategy: 'all', terms_unmatched: [], widened_total: null },
    seed_hour: '2026-11-09T04',
  } as unknown as SearchResult;
}

const ids = (de: number, a: number) => Array.from({ length: a - de + 1 }, (_, i) => de + i);

function monter(premiere: SearchResult) {
  const clef = clefDeRecherche(parametresDeRecherche(parametres));
  return render(withIntl(<PropertiesDiscoveryPage graine={{ resultat: premiere, clef }} />));
}

/** L'ordre des cellules de la grille : `S90` pour un emplacement, `22` pour un bien organique. */
const ordreDesCellules = () =>
  [...document.querySelectorAll('[data-cellule]')].map((c) => {
    const id = c.querySelector('[data-testid^="carte-"]')!.getAttribute('data-testid')!.slice('carte-'.length);
    return c.getAttribute('data-cellule') === 'sponsorise' ? `S${id}` : id;
  });

beforeEach(() => {
  cleanup();
  mockApiFetch.mockReset();
  push.mockReset();
  replace.mockReset();
  parametres = new URLSearchParams('contract_type=rent');
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '');
  oublierDensite();
});

describe('TCK-2499 — deux densités', () => {
  it('« Liste » par défaut : UN élément par bien, la carte en disposition « ligne »', () => {
    monter(page(1, ids(1, 3), [], 3));
    expect(screen.getByRole('radio', { name: 'Liste' })).toHaveAttribute('aria-checked', 'true');
    const cellules = [...document.querySelectorAll('[data-cellule]')];
    expect(cellules).toHaveLength(3);
    // Revue de TCK-2499 — la cellule rendait la ligne ET la carte, l'une masquée (×2,35 nœuds).
    for (const cellule of cellules) expect(cellule.querySelectorAll('article')).toHaveLength(1);
    expect(screen.getByTestId('carte-1')).toHaveAttribute('data-disposition', 'ligne-au-telephone');
  });

  it('« Galerie » en un geste, mémorisée sur l’appareil — et jamais dans l’URL', () => {
    monter(page(1, ids(1, 3), [], 3));
    fireEvent.click(screen.getByRole('radio', { name: 'Galerie' }));

    expect(screen.getByRole('radio', { name: 'Galerie' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('carte-1')).toHaveAttribute('data-disposition', 'carte');
    expect(window.localStorage.getItem(CLE_DENSITE)).toBe('galerie');
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    // Une autre visite (le choix en mémoire oublié, le stockage gardé) : la galerie revient.
    cleanup();
    oublierDensite();
    monter(page(1, ids(1, 3), [], 3));
    expect(screen.getByRole('radio', { name: 'Galerie' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('carte-1')).toHaveAttribute('data-disposition', 'carte');
  });
});

describe('TCK-2500 — les emplacements à la position rendue par l’API', () => {
  it('en tête, puis après dix cartes, puis après dix autres — l’ordre de `data` intact', () => {
    monter(page(1, ids(1, 25), [{ id: 90, position: 0 }, { id: 91, position: 11 }, { id: 92, position: 22 }]));
    const ordre = ordreDesCellules();
    expect(ordre).toHaveLength(28);
    expect(ordre[0]).toBe('S90');
    expect(ordre[11]).toBe('S91');
    expect(ordre[22]).toBe('S92');
    expect(ordre.filter((c) => !c.startsWith('S'))).toEqual(ids(1, 25).map(String));
    // La robe et la mention sobre portent sur les seuls emplacements.
    expect(screen.getByTestId('carte-91')).toHaveAttribute('data-robe', 'sponsorise');
    expect(screen.getByTestId('carte-12')).not.toHaveAttribute('data-robe');
  });
});

describe('TCK-2499 — « Voir N biens de plus » et le retour à la même place', () => {
  it('ouverte sur la page 2 (lien, robot), le compte part des biens des pages précédentes', () => {
    parametres = new URLSearchParams('contract_type=rent&page=2');
    monter(page(2, ids(26, 50)));
    // 25 biens par page : la page 2 finit au 50ᵉ — et non « 25 sur 60 ».
    expect(screen.getByText('50 sur 60 biens')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir 10 biens de plus' })).toBeInTheDocument();
  });

  it('ajoute la page suivante SOUS la première, avec la graine, sans toucher l’URL', async () => {
    monter(page(1, ids(1, 25), [{ id: 90, position: 0 }]));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50), [{ id: 91, position: 0 }, { id: 92, position: 11 }]));

    expect(screen.getByText('25 sur 60 biens')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));

    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());
    const url = new URLSearchParams(String(mockApiFetch.mock.calls[0]![0]).split('?')[1]);
    expect(url.get('page')).toBe('2');
    expect(url.get('seed_hour')).toBe('2026-11-09T04');
    expect(url.get('contract_type')).toBe('rent');
    expect(push).not.toHaveBeenCalled();

    // Les emplacements de la page 2 sont insérés dans SA suite, à leurs positions.
    const ordre = ordreDesCellules();
    expect(ordre.slice(0, 2)).toEqual(['S90', '1']);
    expect(ordre[26]).toBe('S91');
    expect(ordre[26 + 11]).toBe('S92');
    expect(ordre.filter((c) => !c.startsWith('S'))).toEqual(ids(1, 50).map(String));
    // Il en reste dix : le bouton ne promet jamais plus que ce qui reste.
    expect(screen.getByText('50 sur 60 biens')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir 10 biens de plus' })).toBeInTheDocument();
  });

  it('au retour sur la MÊME entrée d’historique, les biens chargés reviennent sans requête', async () => {
    monter(page(1, ids(1, 25)));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50)));
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));
    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());

    // Départ vers une fiche, puis retour : la liste se démonte et se remonte sur la même entrée.
    cleanup();
    mockApiFetch.mockReset();
    monter(page(1, ids(1, 25)));
    expect(screen.getByTestId('carte-50')).toBeInTheDocument();
    expect(screen.getByText('50 sur 60 biens')).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('la position n’est restaurée qu’APRÈS le retour des biens chargés (AC3 : le 30ᵉ bien à l’écran)', async () => {
    monter(page(1, ids(1, 25)));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50)));
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));
    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());
    // La position mémorisée pour cette entrée (celle que `useScrollRestoration` écrit au défilement).
    const entree = (window.history.state as Record<string, string>).__takussanScrollKey;
    const url = `${window.location.pathname}${window.location.search}`;
    window.sessionStorage.setItem(`takussan:scroll:${entree}`, JSON.stringify({ y: 4200, url }));

    cleanup();
    const vus: boolean[] = [];
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      vus.push(screen.queryByTestId('carte-50') !== null);
    });
    try {
      monter(page(1, ids(1, 25)));
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 4200));
      // Chaque tentative a trouvé le document COMPLET : sans cela, 4 200 px seraient écrêtés.
      expect(vus.length).toBeGreaterThan(0);
      expect(vus.every(Boolean)).toBe(true);
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('des pages gardées depuis plus de 30 minutes ne reviennent pas (prix, disponibilité)', async () => {
    monter(page(1, ids(1, 25)));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50)));
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));
    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());
    cleanup();

    // La suite rangée vieillit au-delà de sa durée de vie, d'une minute.
    const entree = (window.history.state as Record<string, string>).__takussanScrollKey;
    const cle = `${PREFIXE_DE_LA_SUITE}${entree}`;
    const rangee = JSON.parse(window.sessionStorage.getItem(cle)!) as { le: number };
    window.sessionStorage.setItem(cle, JSON.stringify({ ...rangee, le: Date.now() - DUREE_DE_VIE_MS - 60_000 }));

    monter(page(1, ids(1, 25)));
    expect(screen.queryByTestId('carte-50')).toBeNull();
    expect(screen.getByText('25 sur 60 biens')).toBeInTheDocument();
  });

  it('chaque écriture purge les suites expirées et ne garde que les cinq listes les plus récentes', async () => {
    const maintenant = Date.now();
    const suiteRangee = (minutes: number) => JSON.stringify({ cle: 'x', pages: [{}], le: maintenant - minutes * 60_000 });
    // Six autres listes de l'onglet, de 1 à 6 minutes, et une expirée.
    for (let m = 1; m <= 6; m++) window.sessionStorage.setItem(`${PREFIXE_DE_LA_SUITE}autre-${m}`, suiteRangee(m));
    window.sessionStorage.setItem(`${PREFIXE_DE_LA_SUITE}expiree`, suiteRangee(31));
    window.sessionStorage.setItem('takussan:scroll:autre-1', '{"y":10}');

    monter(page(1, ids(1, 25)));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50)));
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));
    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());

    const entree = (window.history.state as Record<string, string>).__takussanScrollKey;
    const gardees = Object.keys(window.sessionStorage).filter((k) => k.startsWith(PREFIXE_DE_LA_SUITE)).sort();
    expect(gardees).toHaveLength(LISTES_GARDEES);
    // La courante, puis les quatre plus récentes des autres : ni l'expirée, ni les deux plus vieilles.
    expect(gardees).toEqual(
      [`${PREFIXE_DE_LA_SUITE}${entree}`, ...[1, 2, 3, 4].map((m) => `${PREFIXE_DE_LA_SUITE}autre-${m}`)].sort(),
    );
    // Les positions de `useScrollRestoration` ne sont pas touchées.
    expect(window.sessionStorage.getItem('takussan:scroll:autre-1')).toBe('{"y":10}');
  });

  it('une NOUVELLE entrée vers la même recherche repart de la première page', async () => {
    monter(page(1, ids(1, 25)));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50)));
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));
    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());

    cleanup();
    act(() => window.history.pushState(null, '', window.location.href));
    monter(page(1, ids(1, 25)));
    expect(screen.queryByTestId('carte-50')).toBeNull();
    expect(screen.getByText('25 sur 60 biens')).toBeInTheDocument();
  });

  it('les pages gardées ne valent que pour leur recherche : un autre filtre ne les reprend pas', async () => {
    monter(page(1, ids(1, 25)));
    mockApiFetch.mockResolvedValueOnce(page(2, ids(26, 50)));
    fireEvent.click(screen.getByRole('link', { name: 'Voir 25 biens de plus' }));
    await waitFor(() => expect(screen.getByTestId('carte-50')).toBeInTheDocument());

    cleanup();
    parametres = new URLSearchParams('contract_type=sale');
    monter(page(1, ids(1, 25)));
    expect(screen.queryByTestId('carte-50')).toBeNull();
  });
});

describe('TCK-2499 — Filtres et Carte flottent en permanence au-dessus de la barre d’onglets', () => {
  const matchMediaOriginal = window.matchMedia;
  const sousLg = () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 1023px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  };

  it('sous lg, la pastille est là dès l’arrivée, sans attendre que la rangée d’outils défile', () => {
    sousLg();
    try {
      monter(page(1, ids(1, 3), [], 3));
      const pastille = screen.getByRole('group', { name: 'Outils de recherche' });
      expect(pastille).toHaveTextContent('Filtres');
      expect(pastille).toHaveTextContent('Carte');
    } finally {
      window.matchMedia = matchMediaOriginal;
    }
  });

  it('à zéro résultat, pas de pastille : l’état vide porte ses issues', () => {
    sousLg();
    try {
      monter(page(1, [], [], 0));
      expect(screen.queryByRole('group', { name: 'Outils de recherche' })).toBeNull();
    } finally {
      window.matchMedia = matchMediaOriginal;
    }
  });
});
