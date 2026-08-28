import { describe, expect, it } from 'vitest';

import {
  clefDeRecherche,
  parametresDepuisNext,
  parametresDeRecherche,
  PER_PAGE_PAR_DEFAUT,
} from '@/lib/recherche-publique';

/**
 * TCK-432 — **la requête que le serveur et le client adressent à `/public/properties/search` est la
 * MÊME.**
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER GARDE VRAIMENT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le défaut que ce module existe pour empêcher n'est pas une exception ni un écran cassé : c'est
 * **une liste qui change à l'hydratation**. Le serveur rend trente biens, le client en demande
 * trente autres, et la grille se remplace toute seule sous les yeux du visiteur — sans erreur, sans
 * avertissement, et sans qu'aucun test de rendu ne rougisse.
 *
 * La propriété à tenir est donc une **égalité entre deux chemins d'entrée** : l'objet
 * `searchParams` que Next donne au composant serveur, et la chaîne de requête que le navigateur
 * donne à `useSearch`. Les cas ci-dessous éprouvent l'égalité elle-même, pas chacune des deux
 * branches séparément — deux tests séparés seraient verts tous les deux le jour où les branches
 * divergent.
 */

/** Le chemin CLIENT : `useSearchParams().toString()`. */
const cotéClient = (chaine: string) =>
  clefDeRecherche(parametresDeRecherche(new URLSearchParams(chaine)));

/** Le chemin SERVEUR : l'objet `searchParams` de Next. */
const cotéServeur = (objet: Record<string, string | string[]>) =>
  clefDeRecherche(parametresDeRecherche(parametresDepuisNext(objet)));

describe('TCK-432 — les deux chemins d’entrée décrivent la même requête', () => {
  it('sur un filtre simple', () => {
    expect(cotéServeur({ type: 'villa' })).toBe(cotéClient('type=villa'));
  });

  it('quand l’ORDRE des paramètres diffère — Next rend un objet, le navigateur une chaîne', () => {
    expect(cotéServeur({ page: '2', type: 'villa', city: 'Dakar' })).toBe(
      cotéClient('city=Dakar&type=villa&page=2'),
    );
  });

  it('sur un paramètre RÉPÉTÉ — `?tags=a&tags=b` ne doit pas partir amputé d’un côté', () => {
    // ⚠ C'est le cas qui a motivé `parametresDepuisNext` plutôt que `versParametres` de la
    // canonique : celle-ci garde la PREMIÈRE valeur, délibérément, parce qu'elle lit des clés à
    // valeur unique. Ici, garder la première ferait demander `tags=a` au serveur et `tags=a&tags=b`
    // au client — deux listes pour un seul écran.
    expect(cotéServeur({ tags: ['a', 'b'] })).toBe(cotéClient('tags=a&tags=b'));
    expect(cotéServeur({ tags: ['a', 'b'] })).toContain('tags=a&tags=b');
  });

  it('sur l’alias hérité `search=`, que la table fait posséder par `q`', () => {
    expect(cotéServeur({ search: 'villa piscine' })).toBe(cotéClient('search=villa+piscine'));
    expect(cotéServeur({ search: 'villa piscine' })).toContain('q=villa+piscine');
  });

  it('sur un état géographique que le serveur rendrait en 422 (TCK-346)', () => {
    expect(cotéServeur({ lat: '14.69', sort: 'distance' })).toBe(
      cotéClient('lat=14.69&sort=distance'),
    );
  });
});

describe('TCK-432 — ce que la requête porte toujours', () => {
  it('pose `per_page` quand l’URL n’en a pas', () => {
    const params = parametresDeRecherche(new URLSearchParams('type=villa'));
    expect(params.get('per_page')).toBe(String(PER_PAGE_PAR_DEFAUT));
  });

  it('respecte le `per_page` que l’utilisateur a choisi', () => {
    const params = parametresDeRecherche(new URLSearchParams('per_page=48'));
    expect(params.get('per_page')).toBe('48');
  });

  it('n’écrase pas un `q` explicite par l’alias `search`', () => {
    const params = parametresDeRecherche(new URLSearchParams('q=villa&search=maison'));
    expect(params.get('q')).toBe('villa');
  });

  it('efface la demi-coordonnée et le tri par distance orphelin', () => {
    const params = parametresDeRecherche(new URLSearchParams('lat=14.69&radius_km=5'));
    expect(params.has('lat')).toBe(false);
    expect(params.has('radius_km')).toBe(false);
  });

  it('garde le point complet quand un rayon le consomme', () => {
    const params = parametresDeRecherche(new URLSearchParams('lat=14.69&lng=-17.44&radius_km=5'));
    expect(params.get('lat')).toBe('14.69');
    expect(params.get('radius_km')).toBe('5');
  });

  it('ne MUTE pas l’objet reçu — l’appelant serveur passe ses `searchParams` sans les perdre', () => {
    const source = new URLSearchParams('type=villa');
    parametresDeRecherche(source);
    expect(source.has('per_page')).toBe(false);
    expect(source.toString()).toBe('type=villa');
  });
});

describe('TCK-432 — la clef reconnaît une requête, et une seule', () => {
  it('deux écritures du même jeu de paramètres rendent la même clef', () => {
    expect(clefDeRecherche(new URLSearchParams('b=2&a=1'))).toBe(
      clefDeRecherche(new URLSearchParams('a=1&b=2')),
    );
  });

  it('deux requêtes différentes ne se confondent pas', () => {
    expect(cotéClient('type=villa')).not.toBe(cotéClient('type=apartment'));
  });

  it('l’ORDRE des valeurs d’une même clé est conservé — `type=a,b` n’est pas `type=b,a`', () => {
    // `URLSearchParams.sort()` trie par clé en gardant l'ordre relatif des valeurs d'une clé.
    expect(clefDeRecherche(new URLSearchParams('t=a&t=b'))).not.toBe(
      clefDeRecherche(new URLSearchParams('t=b&t=a')),
    );
  });
});
