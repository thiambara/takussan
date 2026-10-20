import { describe, expect, it } from 'vitest';
import { CLES_PROPRES_A_LA_LISTE, parametresDeLaCarte } from '../recherche-publique';

/**
 * TCK-633 (lot E, AC6) — la carte reçoit TOUS les filtres du panneau, dérivés de la même URL que
 * la liste. Elle n'en recevait que sept, recopiés à la main dans `PropertiesDiscoveryPage` : tout
 * filtre ajouté au panneau en était absent, et la vue carte rendait un autre compte que la liste.
 */
describe('TCK-633 — parametresDeLaCarte', () => {
  it('garde chaque filtre du panneau, tel que l’URL l’écrit', () => {
    const url = new URLSearchParams(
      'city=Dakar&location=Almadies&type=house%2Cvilla&contract_type=rent&rent_period=monthly'
        + '&price_min=1&price_max=2&bedrooms=5&bathrooms=2&area_min=40&area_max=300&furnished=false'
        + '&featured=true&floor_number=0&available_from=2026-11-01&title_type=bail&condition=new'
        + '&tags=Piscine%2CParking',
    );

    expect(parametresDeLaCarte(url)).toEqual({
      city: 'Dakar',
      location: 'Almadies',
      type: 'house,villa',
      contract_type: 'rent',
      rent_period: 'monthly',
      price_min: '1',
      price_max: '2',
      bedrooms: '5',
      bathrooms: '2',
      area_min: '40',
      area_max: '300',
      furnished: 'false',
      featured: 'true',
      floor_number: '0',
      available_from: '2026-11-01',
      title_type: 'bail',
      condition: 'new',
      tags: 'Piscine,Parking',
    });
  });

  it('retire q, search, le tri, la pagination et le rectangle de la liste', () => {
    const url = new URLSearchParams(
      'q=villa&search=villa&sort=price_asc&page=3&per_page=70&lat_min=1&lat_max=2&lng_min=3&lng_max=4&city=Dakar',
    );
    expect(parametresDeLaCarte(url)).toEqual({ city: 'Dakar' });
  });

  it('garde le point avec son rayon, et rien d’un point incomplet', () => {
    expect(parametresDeLaCarte(new URLSearchParams('lat=14.7&lng=-17.45&radius_km=3'))).toEqual({
      lat: '14.7',
      lng: '-17.45',
      radius_km: '3',
    });
    expect(parametresDeLaCarte(new URLSearchParams('lat=14.7&radius_km=3'))).toEqual({});
  });

  it('un point SANS rayon ne part pas : il ne servait qu’au tri par distance, propre à la liste', () => {
    expect(parametresDeLaCarte(new URLSearchParams('lat=14.7&lng=-17.45&sort=distance'))).toEqual({});
  });

  it('n’envoie aucune valeur vide', () => {
    expect(parametresDeLaCarte(new URLSearchParams('city=&type=villa'))).toEqual({ type: 'villa' });
  });

  it('ne mute pas les paramètres reçus', () => {
    const url = new URLSearchParams('q=villa&city=Dakar');
    parametresDeLaCarte(url);
    expect(url.toString()).toBe('q=villa&city=Dakar');
  });

  it('les clés propres à la liste sont celles du contrat', () => {
    expect([...CLES_PROPRES_A_LA_LISTE]).toEqual([
      'q', 'search', 'sort', 'page', 'per_page', 'lat_min', 'lat_max', 'lng_min', 'lng_max', 'placements',
      'seed_hour',
    ]);
  });
});
