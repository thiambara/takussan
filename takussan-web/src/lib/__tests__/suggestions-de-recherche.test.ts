import { describe, it, expect } from 'vitest';
import {
  criteresDeLaReponse,
  filtresDeCriteres,
  filtresDeLaBase,
  hrefDeListe,
  parametresDeCriteres,
  parametresVersLaListe,
  laListeSElargira,
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

  it('une ville comprise retire aussi les villes du profil (`cities`) : sinon ET entre elles, liste vide', () => {
    // `cities=Thiès,Mbour` (les villes d'un profil, en OU) + « appart almadies » (city=Dakar) : garder `cities`
    // demanderait un bien à Dakar ET à Thiès ou Mbour — zéro résultat.
    const base = new URLSearchParams('cities=Thiès,Mbour&contract_type=rent');
    const p = parametresVersLaListe({ type: 'apartment', city: 'Dakar', location: 'Almadies' }, null, base);
    expect(p.has('cities')).toBe(false);
    expect(Object.fromEntries(p)).toEqual({
      contract_type: 'rent',
      type: 'apartment',
      city: 'Dakar',
      location: 'Almadies',
    });
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

/**
 * Revue adverse du 2026-11-04, défaut n° 5 — le compte annoncé est celui de la liste où l'on arrive. La barre envoie à
 * `/api/search/suggest` les filtres de la BASE (URL courante + contrat imposé) sous les noms de la liste publique, et le
 * serveur les fusionne par la règle de `parametresVersLaListe` : un critère compris REMPLACE la même clé, les autres
 * clés de la base restent.
 */
describe('filtresDeLaBase', () => {
  it('ne garde que les filtres de la table, relus et réécrits, sous leur paramètre — jamais le terme, la page ni le tri', () => {
    const base = new URLSearchParams(
      'q=villa&search=villa&page=3&sort=-price&per_page=40&utm_source=x&price_max=100000&furnished=1&contract_type=rent&type=villa,house&city=Kolda&region=Kolda',
    );
    expect(Object.fromEntries(filtresDeLaBase(base))).toEqual({
      city: 'Kolda',
      region: 'Kolda',
      contract_type: 'rent',
      type: 'villa,house',
      price_max: '100000',
      furnished: 'true',
    });
  });

  it('n’envoie pas une valeur que la table ne relit pas en nombre (l’API rendrait 422 et la barre se tairait)', () => {
    const base = new URLSearchParams('price_max=abc&bedrooms=2&lat=x&lng=y&radius_km=z');
    expect(Object.fromEntries(filtresDeLaBase(base))).toEqual({ bedrooms: '2' });
  });

  it('est stable : deux URL aux mêmes filtres dans un autre ordre donnent la même base (clé de cache)', () => {
    const a = filtresDeLaBase(new URLSearchParams('price_max=1&contract_type=rent'));
    const b = filtresDeLaBase(new URLSearchParams('contract_type=rent&price_max=1'));
    expect(a.toString()).toBe(b.toString());
  });

  it('la liste ouverte = la base envoyée, chaque clé comprise remplaçant la sienne', () => {
    const base = new URLSearchParams('price_max=100000&furnished=true&contract_type=rent&type=house&q=ancien');
    const liste = parametresVersLaListe({ type: 'villa', city: 'Dakar', location: 'Almadies' }, null, base);
    expect(Object.fromEntries(liste)).toEqual({
      price_max: '100000',
      furnished: 'true',
      contract_type: 'rent',
      type: 'villa',
      city: 'Dakar',
      location: 'Almadies',
    });
    // Ce que la liste filtre = la base envoyée au compte, critères compris par-dessus.
    const envoyee = filtresDeLaBase(base);
    const attendue = new URLSearchParams(envoyee);
    for (const [cle, valeur] of Object.entries({ type: 'villa', city: 'Dakar', location: 'Almadies' })) attendue.set(cle, valeur);
    expect(Object.fromEntries(filtresDeLaBase(liste))).toEqual(Object.fromEntries(attendue));
  });
});

/**
 * Revue adverse du 2026-11-04, défaut n° 9 — « Voir des biens proches » ne se promet que si la liste s'élargira : sous un
 * compte nul, `PropertySearchService` n'élargit qu'un terme d'au moins deux mots utiles (ADR-0024, `usefulTerms`).
 */
describe('laListeSElargira', () => {
  it('sans résidu, ou sous un résidu d’un seul mot, la liste ne s’élargira pas', () => {
    expect(laListeSElargira({ residue: null })).toBe(false);
    expect(laListeSElargira({ residue: 'sans' })).toBe(false);
    expect(laListeSElargira({ residue: '  piscine  ' })).toBe(false);
  });

  it('un mot répété, aux accents ou à la casse près, ne compte qu’une fois (comme `usefulTerms`)', () => {
    expect(laListeSElargira({ residue: 'Mér mer' })).toBe(false);
  });

  it('sous un résidu d’au moins deux mots distincts, elle peut s’élargir', () => {
    expect(laListeSElargira({ residue: 'vue mer' })).toBe(true);
  });

  it('le serveur, quand il le dit (`widens`), l’emporte sur le compte des mots', () => {
    expect(laListeSElargira({ residue: 'de la', widens: false })).toBe(false);
    expect(laListeSElargira({ residue: null, widens: true })).toBe(true);
  });
});
