import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
const mockPush = vi.fn();
let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useSearch, normaliserGeo, filtersToParams, countActiveFilters } from '../useSearch';

function monte(url: string) {
  parametres = new URLSearchParams(url);
  return renderHook(() => useSearch());
}

function normalise(url: string): string {
  return normaliserGeo(new URLSearchParams(url)).toString();
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    data: [], facets: {}, meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 },
  });
});

/**
 * TCK-346 — le rayon, le point, et les états que le SERVEUR refuse.
 *
 * Ce que chaque test attrape, et pourquoi une régression ne le cocherait pas :
 *
 * | test | régression attrapée | pourquoi elle ne passerait pas quand même |
 * |---|---|---|
 * | `lat=0` lu | le retour au lecteur falsy (`v ? … : undefined`) | l'équateur redeviendrait « pas de point », et le rayon serait effacé par `normaliserGeo` |
 * | demi-point | `required_with` fabriqué par l'interface | l'URL sortante porterait `lng` seul, que le serveur rend en 422 |
 * | `sort=distance` orphelin | l'option de tri sans origine | le tri partirait au serveur et rendrait 422 |
 * | retrait agrégé | `removeFilter('lat')` qui n'efface qu'une moitié | l'URL garderait `lng` et `radius_km` |
 * | compte | trois clés comptées pour une puce | la pastille afficherait 3 pour une seule puce affichée |
 */
describe('TCK-346 — lecture du point et du rayon depuis l’URL', () => {
  it('lit `lat=0` comme une COORDONNÉE, pas comme une absence', () => {
    const { result } = monte('lat=0&lng=0&radius_km=5');
    expect(result.current.filters.lat).toBe(0);
    expect(result.current.filters.lng).toBe(0);
    expect(result.current.filters.radius_km).toBe(5);
  });

  it('lit un rayon décimal', () => {
    const { result } = monte('lat=14.6928&lng=-17.4467&radius_km=2.5');
    expect(result.current.filters.radius_km).toBe(2.5);
  });

  it('compte le rayon et son point pour UN seul filtre', () => {
    const { result } = monte('lat=14.6928&lng=-17.4467&radius_km=5');
    expect(result.current.activeCount).toBe(1);
  });

  it('compte le rayon À CÔTÉ des autres filtres, sans les absorber', () => {
    const { result } = monte('lat=14.6928&lng=-17.4467&radius_km=5&bedrooms=3');
    expect(result.current.activeCount).toBe(2);
  });
});

describe('TCK-346 — `normaliserGeo` efface les états que le serveur rend en 422', () => {
  it('efface une demi-coordonnée', () => {
    expect(normalise('lat=14.69&city=Dakar')).toBe('city=Dakar');
    expect(normalise('lng=-17.44&city=Dakar')).toBe('city=Dakar');
  });

  it('efface un rayon sans point', () => {
    expect(normalise('radius_km=5&city=Dakar')).toBe('city=Dakar');
  });

  it('efface `sort=distance` quand il n’a pas d’origine', () => {
    expect(normalise('sort=distance&city=Dakar')).toBe('city=Dakar');
  });

  it('efface un point que plus rien ne consomme', () => {
    // Ni rayon ni tri par distance : le point ne filtre rien, ne porte aucune puce, et
    // repartirait pourtant dans la prochaine recherche sauvegardée.
    expect(normalise('lat=14.69&lng=-17.44&city=Dakar')).toBe('city=Dakar');
  });

  it('GARDE le point quand `sort=distance` le consomme, sans rayon', () => {
    expect(normalise('lat=14.69&lng=-17.44&sort=distance')).toBe(
      'lat=14.69&lng=-17.44&sort=distance',
    );
  });

  it('GARDE un point complet avec son rayon, `lat=0` compris', () => {
    expect(normalise('lat=0&lng=0&radius_km=5')).toBe('lat=0&lng=0&radius_km=5');
  });
});

describe('TCK-346 — ce que l’URL sortante porte', () => {
  it('sérialise les trois paramètres', () => {
    const qs = filtersToParams({ lat: 14.6928, lng: -17.4467, radius_km: 10 }).toString();
    expect(new URLSearchParams(qs).get('lat')).toBe('14.6928');
    expect(new URLSearchParams(qs).get('lng')).toBe('-17.4467');
    expect(new URLSearchParams(qs).get('radius_km')).toBe('10');
  });

  it('n’écrit JAMAIS un rayon sans point', () => {
    expect(filtersToParams({ radius_km: 10 }).toString()).toBe('');
  });

  it('n’écrit JAMAIS `sort=distance` sans point', () => {
    expect(filtersToParams({ sort: 'distance', bedrooms: 3 }).toString()).toBe('bedrooms=3');
  });

  it('compte pour un seul filtre actif', () => {
    expect(countActiveFilters({ lat: 14.69, lng: -17.44, radius_km: 5 })).toBe(1);
  });
});

describe('TCK-346 — le retrait est ATOMIQUE', () => {
  it('retire le point entier quand on retire le rayon', () => {
    const { result } = monte('lat=14.69&lng=-17.44&radius_km=5&city=Dakar');
    act(() => result.current.removeFilter('radius_km'));
    const url = new URL(mockPush.mock.calls[0][0], 'https://x.test');
    expect(url.searchParams.get('lat')).toBeNull();
    expect(url.searchParams.get('lng')).toBeNull();
    expect(url.searchParams.get('radius_km')).toBeNull();
    expect(url.searchParams.get('city')).toBe('Dakar');
  });

  it('ne laisse pas de demi-point quand c’est `lat` qu’on retire', () => {
    // Chemin réel : sur un 422, `PropertiesDiscoveryPage` propose de retirer le filtre que
    // le serveur NOMME — et il nomme `lat`. N'effacer que `lat` laisserait `lng`, donc un
    // second 422 (`required_with:lat`), sur un bouton censé réparer la recherche.
    //
    // ⚠ Ce test est rendu vert par `normaliserGeo`, et par lui SEUL — mesuré : ablation de
    // `normaliserGeo` → rouge ; ablation de la remontée à l'agrégateur qui existait aussi
    // dans `removeFilter` → VERT, ce qui l'a fait supprimer.
    const { result } = monte('lat=14.69&lng=-17.44&radius_km=5');
    act(() => result.current.removeFilter('lat'));
    const url = new URL(mockPush.mock.calls[0][0], 'https://x.test');
    expect(url.searchParams.get('lng')).toBeNull();
    expect(url.searchParams.get('radius_km')).toBeNull();
  });

  it('retire aussi `sort=distance`, qui n’a plus d’origine', () => {
    const { result } = monte('lat=14.69&lng=-17.44&radius_km=5&sort=distance');
    act(() => result.current.removeFilter('radius_km'));
    const url = new URL(mockPush.mock.calls[0][0], 'https://x.test');
    expect(url.searchParams.get('sort')).toBeNull();
  });
});

describe('TCK-346 — la requête envoyée au serveur', () => {
  it('transmet le rayon et son point', async () => {
    monte('lat=14.6928&lng=-17.4467&radius_km=5');
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const chemin = String(mockApiFetch.mock.calls[0][0]);
    expect(chemin.startsWith('/public/properties/search?')).toBe(true);
    const envoyes = new URLSearchParams(chemin.split('?')[1]);
    expect(envoyes.get('lat')).toBe('14.6928');
    expect(envoyes.get('radius_km')).toBe('5');
  });

  it('n’envoie PAS un `sort=distance` orphelin, qui rendrait 422 à coup sûr', async () => {
    monte('sort=distance&city=Dakar');
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const envoyes = new URLSearchParams(String(mockApiFetch.mock.calls[0][0]).split('?')[1]);
    expect(envoyes.get('sort')).toBeNull();
    expect(envoyes.get('city')).toBe('Dakar');
  });

  it('n’expose pas non plus ce tri à l’écran — ce qui est affiché est ce qui est demandé', () => {
    const { result } = monte('sort=distance&city=Dakar');
    expect(result.current.filters.sort).toBeUndefined();
  });
});
