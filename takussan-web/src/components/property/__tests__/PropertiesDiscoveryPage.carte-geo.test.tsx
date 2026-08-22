import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';

let parametres = new URLSearchParams();

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

// La carte réelle tire Leaflet et le réseau : on ne garde que le contrat de props.
const filtresRecus: Array<Record<string, unknown>> = [];
vi.mock('@/components/map', () => ({
  PropertyMap: ({ filters }: { filters: Record<string, unknown> }) => {
    filtresRecus.push(filters);
    return <div data-testid="carte" />;
  },
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    data: [],
    facets: {},
    meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 },
  });
  filtresRecus.length = 0;
  parametres = new URLSearchParams();
});

async function basculerEnVueCarte() {
  render(withIntl(<PropertiesDiscoveryPage />));
  await waitFor(() => expect(screen.getByRole('tab', { name: /carte/i })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('tab', { name: /carte/i }));
  await waitFor(() => expect(screen.getByTestId('carte')).toBeInTheDocument());

  return filtresRecus[filtresRecus.length - 1];
}

/**
 * TCK-346 — le rayon survit à la bascule liste → carte.
 *
 * Le défaut que ce fichier garde n'était pas une erreur : c'était un SILENCE.
 * `/search` et `/map` sont deux endpoints sur deux moteurs, mais un seul écran.
 * Tant que `mapFilters` ne transmettait pas les trois clés géo, un visiteur qui
 * posait « à moins de 3 km » puis cliquait sur l'onglet Carte voyait réapparaître
 * les biens que la liste venait d'écarter — deux comptes différents pour la même
 * recherche, sans un mot.
 */
describe('TCK-346 — la vue carte reçoit le rayon', () => {
  it('transmet lat, lng et radius_km à /map', async () => {
    parametres = new URLSearchParams('lat=14.7&lng=-17.45&radius_km=3');

    const filtres = await basculerEnVueCarte();

    expect(filtres).toMatchObject({ lat: 14.7, lng: -17.45, radius_km: 3 });
  });

  it('ne transmet aucune clé géo quand aucun point n’est posé', async () => {
    parametres = new URLSearchParams('contract_type=rent');

    const filtres = await basculerEnVueCarte();

    expect(filtres.lat).toBeUndefined();
    expect(filtres.lng).toBeUndefined();
    expect(filtres.radius_km).toBeUndefined();
    // Le reste du sous-ensemble supporté par `/map` continue de passer.
    expect(filtres.contract_type).toBe('rent');
  });

  /**
   * ⚠ `normaliserGeo()` efface un point à moitié posé AVANT qu'il n'atteigne
   * l'URL — et donc avant `mapFilters`. Sans quoi `/map` rendrait 422
   * (`required_with:lat`), exactement comme `/search`.
   */
  it('n’envoie pas une demi-coordonnée, que /map refuserait en 422', async () => {
    parametres = new URLSearchParams('lat=14.7&radius_km=3');

    const filtres = await basculerEnVueCarte();

    expect(filtres.lat).toBeUndefined();
    expect(filtres.radius_km).toBeUndefined();
  });

  /**
   * `/map` ne déclare aucun tri (cf. le docblock de
   * `PublicPropertyController::map()`) : lui envoyer `sort` fabriquerait un
   * contrat que le serveur ignore.
   */
  it('ne transmet pas le tri à /map', async () => {
    parametres = new URLSearchParams('lat=14.7&lng=-17.45&sort=distance');

    const filtres = await basculerEnVueCarte();

    expect(filtres.sort).toBeUndefined();
  });
});
