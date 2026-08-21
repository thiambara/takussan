import { describe, it, expect } from 'vitest';

import {
  repliDeRecherche,
  retirerTermeDeLaRequete,
  type SearchResult,
} from '@/types/search';

/**
 * TCK-338, moitié front — la lecture du bloc `search` et le geste qu'elle rend possible.
 *
 * Ces deux fonctions sont la charnière : sans elles, `search.strategy` et
 * `search.terms_unmatched` arrivent dans le JSON et **meurent là** (c'est l'état exact que
 * l'ADR-0020 décrit en « conséquences »). Elles sont testées ICI, hors de tout rendu, parce que
 * ce sont les deux endroits où l'on peut se tromper *silencieusement* : afficher une étiquette
 * sur un résultat exact, ou retirer le mauvais mot de la requête de l'utilisateur.
 */

function reponse(partiel: Partial<SearchResult>): SearchResult {
  return {
    data: [],
    facets: { locations: {}, bedrooms: {}, types: {} },
    meta: { current_page: 1, last_page: 1, per_page: 30, total: 0 },
    ...partiel,
  } as SearchResult;
}

describe('repliDeRecherche — ce que l’écran a le droit de dire', () => {
  it('ne dit RIEN sous le régime nominal, même si le bloc porte des termes', () => {
    // Le cas qui compte : un back qui remplirait `terms_unmatched` sous `all` (ou un client qui
    // lirait le tableau sans regarder `strategy`) ferait afficher « aucun bien ne correspond à
    // Saly » AU-DESSUS de biens qui portent tous les termes. C'est `strategy` qui commande.
    expect(
      repliDeRecherche(
        reponse({ search: { strategy: 'all', terms_unmatched: ['Saly'], widened_total: null } }),
      ),
    ).toBeNull();
  });

  it('ne dit rien quand la réponse ne porte pas de bloc `search`', () => {
    // Le champ est optionnel par construction : une réponse d'un déploiement antérieur
    // (`api.takussan.com` rend 404, TCK-332) ne doit pas produire d'étiquette fantôme.
    expect(repliDeRecherche(reponse({}))).toBeNull();
    expect(repliDeRecherche(null)).toBeNull();
  });

  it('nomme le terme sondé à 0 et rend le compte ÉLARGI', () => {
    const repli = repliDeRecherche(
      reponse({
        meta: { current_page: 1, last_page: 3, per_page: 30, total: 63 },
        search: { strategy: 'widened', terms_unmatched: ['Saly'], widened_total: 63 },
      }),
    );

    expect(repli).toEqual({ termesSansResultat: ['Saly'], totalElargi: 63 });
  });

  it('rend une liste VIDE quand l’intersection seule est vide — sans inventer de coupable', () => {
    // `studio piscine` : 44 et 3 séparément, 0 ensemble. Aucun mot n'est fautif.
    const repli = repliDeRecherche(
      reponse({
        meta: { current_page: 1, last_page: 2, per_page: 30, total: 44 },
        search: { strategy: 'widened', terms_unmatched: [], widened_total: 44 },
      }),
    );

    expect(repli).not.toBeNull();
    expect(repli?.termesSansResultat).toEqual([]);
    expect(repli?.totalElargi).toBe(44);
  });

  it('écarte les entrées vides ou non textuelles au lieu d’en faire une puce irréparable', () => {
    const repli = repliDeRecherche(
      reponse({
        search: {
          strategy: 'widened',
          terms_unmatched: ['Saly', '', '   ', 7 as unknown as string],
          widened_total: 12,
        },
      }),
    );

    expect(repli?.termesSansResultat).toEqual(['Saly']);
  });

  it('retombe sur `meta.total` si `widened_total` manque — jamais sur le nombre de cartes', () => {
    // `data` est plafonné par `per_page` : compter les cartes afficherait « 30 biens proches »
    // là où le moteur en a 63.
    const repli = repliDeRecherche(
      reponse({
        meta: { current_page: 1, last_page: 3, per_page: 30, total: 63 },
        search: {
          strategy: 'widened',
          terms_unmatched: ['Saly'],
          widened_total: null as unknown as number,
        },
      }),
    );

    expect(repli?.totalElargi).toBe(63);
  });
});

describe('retirerTermeDeLaRequete — le geste qui garde le travail de l’utilisateur', () => {
  it('retire le terme et garde le reste', () => {
    expect(retirerTermeDeLaRequete('villa Saly', 'Saly')).toBe('villa');
    expect(retirerTermeDeLaRequete('villa Saly meublée', 'Saly')).toBe('villa meublée');
  });

  it('retire le terme quelle que soit sa POSITION', () => {
    // Une implémentation qui couperait le dernier mot cocherait le test ci-dessus et rougirait ici.
    expect(retirerTermeDeLaRequete('Saly villa', 'Saly')).toBe('villa');
  });

  it('compare sur la forme pliée : casse et accents ne font pas échouer le retrait', () => {
    expect(retirerTermeDeLaRequete('Villa SALY', 'saly')).toBe('Villa');
    expect(retirerTermeDeLaRequete('maison Thiès', 'thies')).toBe('maison');
  });

  it('sépare sur la ponctuation, comme le back qui a sondé le terme', () => {
    // `usefulTerms()` découpe sur `[^\p{L}\p{N}]+` : « villa, Saly » porte DEUX termes.
    // Les traiter comme un seul rendrait le bouton « Retirer « Saly » » sans effet.
    expect(retirerTermeDeLaRequete('villa, Saly', 'Saly')).toBe('villa');
    expect(retirerTermeDeLaRequete('villa/Saly', 'Saly')).toBe('villa');
  });

  it('ne retire QUE le terme demandé', () => {
    expect(retirerTermeDeLaRequete('villa Saly', 'villa')).toBe('Saly');
    expect(retirerTermeDeLaRequete('villa Saly', 'Mbour')).toBe('villa Saly');
  });

  it('rend une chaîne vide quand le terme était toute la requête', () => {
    // L'appelant écrit alors une URL sans `q` — `filtersToParams` n'écrit pas les valeurs vides.
    expect(retirerTermeDeLaRequete('Saly', 'Saly')).toBe('');
    expect(retirerTermeDeLaRequete('  Saly  ', 'Saly')).toBe('');
  });

  it('ne retire rien sur un terme vide, et ne casse pas la requête', () => {
    expect(retirerTermeDeLaRequete('villa Saly', '   ')).toBe('villa Saly');
  });
});
