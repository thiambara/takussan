import { describe, it, expect } from 'vitest';
import {
  criteresDeLaReponse,
  filtresDeCriteres,
  hrefDeListe,
  parametresDeCriteres,
  parametresVersLaListe,
} from '../suggestions-de-recherche';

/**
 * TCK-2475 — une suggestion COMPRISE mène à la liste filtrée par ses critères, et l'URL passe par la
 * table des clés de recherche (`SEARCH_FILTER_KEYS`) : le serveur rend des paramètres d'URL, le
 * front les relit et les réécrit par ses propres lecteurs, jamais tels quels.
 */
describe('parametresDeCriteres', () => {
  it('relit chaque critère connu par la table, et l’écrit sous son paramètre', () => {
    const p = parametresDeCriteres({ type: 'apartment', bedrooms: 3, city: 'Dakar', location: 'Almadies' });
    expect(Object.fromEntries(p)).toEqual({ location: 'Almadies', city: 'Dakar', type: 'apartment', bedrooms: '3' });
  });

  it('une liste devient la forme à virgules de la table', () => {
    expect(parametresDeCriteres({ type: ['villa', 'house'] }).get('type')).toBe('villa,house');
  });

  it('écarte une clé que la table ne connaît pas, et une clé de contrôle', () => {
    const p = parametresDeCriteres({ inconnue: 'x', page: 3, sort: 'price_asc', city: 'Thiès' });
    expect(Object.fromEntries(p)).toEqual({ city: 'Thiès' });
  });

  it('écarte les valeurs vides', () => {
    expect(parametresDeCriteres({ city: '', type: [] }).toString()).toBe('');
  });
});

describe('criteresDeLaReponse', () => {
  it('un objet vide sérialisé en tableau par PHP reste un objet vide', () => {
    expect(criteresDeLaReponse([] as unknown as Record<string, never>)).toEqual({});
    expect(criteresDeLaReponse(undefined)).toEqual({});
    expect(criteresDeLaReponse({ city: 'Dakar' })).toEqual({ city: 'Dakar' });
  });
});

describe('parametresVersLaListe', () => {
  it('pose les critères sur la base, remplace le terme, et retire la pagination', () => {
    const base = new URLSearchParams('q=villa&search=villa&contract_type=rent&page=4');
    const p = parametresVersLaListe({ type: 'apartment', bedrooms: 3 }, null, base);
    expect(Object.fromEntries(p)).toEqual({ contract_type: 'rent', type: 'apartment', bedrooms: '3' });
  });

  it('le texte restant part en `q`', () => {
    const p = parametresVersLaListe({ type: 'apartment' }, ' me ', new URLSearchParams());
    expect(p.get('q')).toBe('me');
  });

  it('une ville retire le quartier et la région d’avant (comme une ville choisie dans la liste)', () => {
    const base = new URLSearchParams('city=Kolda&region=Kolda&location=Escale');
    const p = parametresVersLaListe({ city: 'Dakar' }, null, base);
    expect(Object.fromEntries(p)).toEqual({ city: 'Dakar' });
  });

  it('un quartier compris garde sa ville', () => {
    const p = parametresVersLaListe({ city: 'Dakar', location: 'Almadies' }, null, new URLSearchParams('region=X'));
    expect(Object.fromEntries(p)).toEqual({ location: 'Almadies', city: 'Dakar' });
  });

  it('le critère compris l’emporte sur celui de la base', () => {
    const p = parametresVersLaListe({ contract_type: 'sale' }, null, new URLSearchParams('contract_type=rent'));
    expect(p.get('contract_type')).toBe('sale');
  });
});

describe('hrefDeListe', () => {
  it('pose la langue', () => {
    expect(hrefDeListe(new URLSearchParams('city=Dakar'), 'fr')).toBe('/fr/properties?city=Dakar');
    expect(hrefDeListe(new URLSearchParams(), 'en')).toBe('/en/properties');
  });
});

describe('filtresDeCriteres', () => {
  it('rend les filtres typés de la table, terme restant compris', () => {
    expect(filtresDeCriteres({ type: 'apartment', bedrooms: 3 }, 'me')).toEqual({
      q: 'me',
      type: ['apartment'],
      bedrooms: 3,
    });
  });
});
