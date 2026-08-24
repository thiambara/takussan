import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';

let parametres = new URLSearchParams('q=villa+Saly');
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// Chrome du site et surfaces lourdes : hors sujet ici, et elles tirent auth / carte / réseau.
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: { id: number; title: string } }) => (
    <article data-testid={`carte-${property.id}`}>{property.title}</article>
  ),
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';
import { ApiError } from '@/lib/api';

type BlocSearch = { strategy: 'all' | 'widened'; terms_unmatched: string[]; widened_total: number | null };

function reponse(total: number, search: BlocSearch) {
  return {
    data: [{ id: 22, title: 'Villa luxueuse à Grand-Yoff' }],
    facets: { locations: {}, bedrooms: {}, types: {} },
    meta: { total, per_page: 30, current_page: 1, last_page: Math.max(1, Math.ceil(total / 30)) },
    search,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  push.mockReset();
  parametres = new URLSearchParams('q=villa+Saly');
});

/**
 * TCK-338, moitié front — **le bloc `search` ne doit plus mourir dans le JSON**.
 *
 * Mesuré par l'agent back le 2026-08-21 : sur `q=villa Saly`, la charge utile est identique à
 * l'octet près hors du bloc `search`. C'est-à-dire que le passage en conjonction, à lui seul,
 * ne change **rien à l'écran** dans le cas qui a ouvert le ticket — les 63 villas de Dakar sont
 * toujours là, et rien ne dit que « Saly » a été relâché. Le contrat d'API cessait de mentir ;
 * l'écran, lui, continuait.
 *
 * Ces quatre tests montent la vraie page, avec le vrai `useSearch`, et ne remplacent que le
 * réseau : c'est le seul niveau où l'on prouve que la donnée traverse `SearchResult`, le hook,
 * puis le rendu.
 */
describe('TCK-338 — la page rend l’étiquette du repli', () => {
  it('sur un terme sans résultat : nomme le terme, garde le compte, et le retire pour de bon', async () => {
    mockApiFetch.mockResolvedValue(
      reponse(63, { strategy: 'widened', terms_unmatched: ['Saly'], widened_total: 63 }),
    );

    render(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Aucun bien ne correspond à « Saly ».');
    });
    // Le compteur de la barre d'outils reste celui du moteur — l'étiquette le QUALIFIE, elle ne
    // le contredit pas. Deux comptes différents sur le même écran seraient un défaut de plus.
    expect(screen.getByText(/63 biens trouvés/)).toBeInTheDocument();
    expect(screen.getByTestId('carte-22')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Retirer « Saly »/ }));

    // ⚠ L'assertion qui fait la différence entre « on affiche un message » et « on répare » :
    // l'URL perd le mot fautif et GARDE le reste de la demande.
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toBe('/properties?q=villa&page=1');
    attendAucuneCleBrute();
  });

  it('quand l’intersection seule est vide : ne nomme aucun mot, propose d’effacer les mots-clés', async () => {
    parametres = new URLSearchParams('q=studio+piscine');
    mockApiFetch.mockResolvedValue(
      reponse(44, { strategy: 'widened', terms_unmatched: [], widened_total: 44 }),
    );

    render(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Aucun bien ne réunit tous vos mots.');
    });
    expect(screen.queryByText(/Aucun bien ne correspond à/)).not.toBeInTheDocument();
    // Ni « studio » ni « piscine » ne sont désignés : chacun est vrai séparément.
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Effacer les mots-clés/ }));
    expect(push).toHaveBeenCalledTimes(1);
    // `q` disparaît de l'URL, les filtres structurés (ici aucun) seraient conservés.
    expect(push.mock.calls[0][0]).toBe('/properties?page=1');
    attendAucuneCleBrute();
  });

  it('sous le régime nominal, l’écran ne dit RIEN — et c’est le cas de presque toutes les requêtes', async () => {
    parametres = new URLSearchParams('q=villa');
    mockApiFetch.mockResolvedValue(
      reponse(63, { strategy: 'all', terms_unmatched: [], widened_total: null }),
    );

    render(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByTestId('carte-22')).toBeInTheDocument();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucun bien ne/)).not.toBeInTheDocument();
  });

  it('sur une PANNE, l’étiquette s’efface : deux affirmations concurrentes valent moins qu’une', async () => {
    // Un 5xx n'invalide pas ce qui était juste il y a une seconde : `useSearch` GARDE le
    // résultat précédent, donc le bloc `search` du repli survit dans l'état. Sans le garde
    // `!error`, l'écran porterait « Une erreur est survenue » ET « voici 63 biens proches ».
    mockApiFetch.mockResolvedValue(
      reponse(63, { strategy: 'widened', terms_unmatched: ['Saly'], widened_total: 63 }),
    );

    const { rerender } = render(withIntl(<PropertiesDiscoveryPage />));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    mockApiFetch.mockRejectedValue(new ApiError(500, null));
    parametres = new URLSearchParams('q=villa+Saly&page=2');
    rerender(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
