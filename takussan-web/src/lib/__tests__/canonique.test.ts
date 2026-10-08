import { describe, expect, it } from 'vitest';

import {
  CHEMIN_LISTE,
  CLES_CANONIQUES,
  CLES_ECARTEES,
  type DomainesDeFacette,
  cheminCanoniqueDeLaListe,
  domainesStatiques,
  versParametres,
} from '../canonique';
import { propertyTypeValues } from '@/lib/schemas/property';
import { PAGES_STATIQUES_INDEXABLES } from '../sitemap';
import { CLES_DE_RECHERCHE } from '@/types/search';

/** Le domaine du catalogue de test : deux villes, et la casse canonique est celle du catalogue. */
const DOMAINES: DomainesDeFacette = {
  ...domainesStatiques(),
  villes: new Map([
    ['dakar', 'Dakar'],
    ['thiès', 'Thiès'],
  ]),
};

const canonique = (requete: string, domaines: DomainesDeFacette = DOMAINES) =>
  cheminCanoniqueDeLaListe(new URLSearchParams(requete), domaines);

/**
 * TCK-433 · AC1 — **le test NOMME la règle**, comme l'AC l'exige : *« il échouerait aussi bien si
 * la canonique disparaissait que si elle recopiait l'URL demandée »*.
 *
 * Les deux moitiés sont éprouvées séparément : ce qui est RETENU (trois clés, un ordre fixe) et ce
 * qui est ÉCARTÉ (les dix-huit autres filtres, plus les trois contrôles). Un test qui n'aurait
 * vérifié que la première serait vert sur une canonique qui recopie l'URL.
 */
describe('la partition des 24 clés est TOTALE', () => {
  it('couvre exactement `CLES_DE_RECHERCHE`', () => {
    // Le contrôle qui empêche une clé neuve d'échapper à la décision : ajouter une entrée à
    // `SEARCH_FILTER_KEYS` sans trancher sa canonicité fait rougir ici.
    expect([...CLES_CANONIQUES, ...CLES_ECARTEES].sort()).toEqual([...CLES_DE_RECHERCHE].sort());
    expect(CLES_CANONIQUES.length + CLES_ECARTEES.length).toBe(CLES_DE_RECHERCHE.length);
  });

  it('retient quatre clés, et ces quatre-là — `location` depuis TCK-598', () => {
    expect([...CLES_CANONIQUES]).toEqual(['contract_type', 'type', 'city', 'location']);
  });

  it('écarte les trois contrôles', () => {
    for (const controle of ['sort', 'page', 'per_page'] as const) {
      expect(CLES_ECARTEES, controle).toContain(controle);
    }
  });
});

describe('cheminCanoniqueDeLaListe — ce qui est RETENU', () => {
  it('garde un contrat seul', () => {
    expect(canonique('contract_type=rent')).toBe('/properties?contract_type=rent');
  });

  it('garde un type unique', () => {
    expect(canonique('type=villa')).toBe('/properties?type=villa');
  });

  it('garde une ville', () => {
    expect(canonique('city=Dakar')).toBe('/properties?city=Dakar');
  });

  it('garde les trois ensemble, dans l’ordre de la RÈGLE et non celui de la requête', () => {
    // Sans ordre fixe, `?type=villa&city=Dakar` et `?city=Dakar&type=villa` — la même page —
    // produiraient deux canoniques différentes, c'est-à-dire le défaut qu'on corrige.
    const attendu = '/properties?contract_type=rent&type=villa&city=Dakar';
    expect(canonique('city=Dakar&type=villa&contract_type=rent')).toBe(attendu);
    expect(canonique('type=villa&contract_type=rent&city=Dakar')).toBe(attendu);
  });
});

describe('cheminCanoniqueDeLaListe — ce qui est ÉCARTÉ', () => {
  it('replie l’exemple exact de l’AC1 sur la facette retenue', () => {
    expect(canonique('type=villa&page=3&sort=-created_at&per_page=48')).toBe(
      '/properties?type=villa',
    );
  });

  it('replie la pagination et le tri sur la page nue', () => {
    expect(canonique('page=3')).toBe(CHEMIN_LISTE);
    expect(canonique('sort=-created_at&per_page=48')).toBe(CHEMIN_LISTE);
  });

  it.each([
    'q=villa+piscine',
    'search=villa',
    'price_min=45000&price_max=47500',
    'area_min=80',
    'bedrooms=3',
    'bathrooms=2',
    'floor_number=4',
    'furnished=true',
    'featured=true',
    'available_from=2026-09-01',
    'tags=piscine',
    'rent_period=month',
    'location=Ngor',
    'radius_km=5&lat=14.69&lng=-17.44',
  ])('replie « %s » sur la page nue', (requete) => {
    expect(canonique(requete)).toBe(CHEMIN_LISTE);
  });

  it('un type MULTIPLE se replie — une vue composée n’est pas une facette', () => {
    expect(canonique('type=villa,house')).toBe(CHEMIN_LISTE);
    expect(canonique('type=villa,house,apartment')).toBe(CHEMIN_LISTE);
  });

  it('une clé retenue mais VIDE ne fabrique pas une canonique fantôme', () => {
    expect(canonique('type=')).toBe(CHEMIN_LISTE);
    expect(canonique('city=')).toBe(CHEMIN_LISTE);
  });

  it('un filtre écarté n’efface pas une facette retenue qui l’accompagne', () => {
    expect(canonique('type=villa&price_min=45000&page=7')).toBe('/properties?type=villa');
  });
});

describe('versParametres — la forme que Next donne à `searchParams`', () => {
  it('accepte une valeur simple', () => {
    expect(cheminCanoniqueDeLaListe(versParametres({ type: 'villa' }), DOMAINES)).toBe(
      '/properties?type=villa',
    );
  });

  it('garde la PREMIÈRE valeur d’un paramètre répété, comme `URLSearchParams.get`', () => {
    expect(cheminCanoniqueDeLaListe(versParametres({ city: ['Dakar', 'Thiès'] }), DOMAINES)).toBe(
      '/properties?city=Dakar',
    );
  });

  it('ignore une clé absente', () => {
    expect(cheminCanoniqueDeLaListe(versParametres({ type: undefined }), DOMAINES)).toBe(
      CHEMIN_LISTE,
    );
  });
});

describe('le DOMAINE borne l’espace des URL indexables — passe 2', () => {
  /*
   * Le critère qui porte toute la règle — « leur ensemble de valeurs est FINI et énumérable » —
   * n'était appliqué NULLE PART. Mesuré sur un build de production le 2026-08-27 :
   * `?city=Zzzinventee` rendait `index, follow` + une canonique vers elle-même, et `?type=zzz`
   * ajoutait `<title>property.types.zzz — Takussan</title>`, une clé d'i18n servie à un moteur.
   *
   * Ces cas-là sont exactement ceux que les 24 combinaisons du test de titre ne pouvaient pas
   * voir : elles étaient toutes construites avec des valeurs VALIDES.
   */
  it.each([
    ['type', 'type=zzznexistepas'],
    ['contract_type', 'contract_type=zzznexistepas'],
    ['city', 'city=Zzzinventee'],
  ])('une valeur inconnue de « %s » se replie sur la page nue', (_cle, requete) => {
    expect(canonique(requete)).toBe(CHEMIN_LISTE);
  });

  it('une valeur inconnue n’efface pas une facette valide qui l’accompagne', () => {
    expect(canonique('type=villa&city=Zzzinventee')).toBe('/properties?type=villa');
  });

  it('le domaine des TYPES est celui du dépôt, et il est complet', () => {
    // Dérivé : chaque valeur de `propertyTypeValues` doit être acceptée. Une liste amputée
    // ferait cesser la facette correspondante d'être indexable, en silence.
    for (const type of propertyTypeValues) {
      expect(canonique(`type=${type}`), type).toBe(`/properties?type=${type}`);
    }
  });

  it('les deux contrats sont acceptés, et rien d’autre', () => {
    expect(canonique('contract_type=rent')).toBe('/properties?contract_type=rent');
    expect(canonique('contract_type=sale')).toBe('/properties?contract_type=sale');
    expect(canonique('contract_type=lease')).toBe(CHEMIN_LISTE);
  });

  describe('la casse ne crée pas une seconde URL indexable', () => {
    it('replie la ville sur la casse du CATALOGUE', () => {
      // Sans ce repli, la validation aurait fermé un espace non borné pour en rouvrir un plus
      // petit : une URL indexable par variante de casse.
      expect(canonique('city=dakar')).toBe('/properties?city=Dakar');
      expect(canonique('city=DAKAR')).toBe('/properties?city=Dakar');
      expect(canonique('city=Dakar')).toBe('/properties?city=Dakar');
    });

    it('replie le type et le contrat en minuscules', () => {
      expect(canonique('type=VILLA')).toBe('/properties?type=villa');
      expect(canonique('contract_type=Rent')).toBe('/properties?contract_type=rent');
    });

    it('tolère les espaces autour de la valeur', () => {
      expect(canonique('city=%20Dakar%20')).toBe('/properties?city=Dakar');
    });
  });

  describe('domaine des villes INCONNAISSABLE', () => {
    const sansDomaine: DomainesDeFacette = { ...domainesStatiques(), villes: null };

    it('replie TOUTE facette de ville — on n’affirme pas sur un domaine qu’on ignore', () => {
      expect(canonique('city=Dakar', sansDomaine)).toBe(CHEMIN_LISTE);
    });

    it('ne touche PAS aux deux autres facettes, que le dépôt connaît seul', () => {
      expect(canonique('type=villa&city=Dakar', sansDomaine)).toBe('/properties?type=villa');
    });

    it('un domaine VIDE n’est pas la même chose qu’un domaine inconnu, mais replie aussi', () => {
      const vide: DomainesDeFacette = { ...domainesStatiques(), villes: new Map() };
      expect(canonique('city=Dakar', vide)).toBe(CHEMIN_LISTE);
    });
  });
});

describe('TCK-433 · AC5 — cohérence avec le sitemap de TCK-431', () => {
  it('le sitemap ne déclare que des chemins CANONIQUES', () => {
    // Un chemin du sitemap qui ne serait pas sa propre canonique dirait au moteur, d'un côté
    // « indexe ceci », de l'autre « la référence est ailleurs ».
    for (const page of PAGES_STATIQUES_INDEXABLES) {
      if (!page.chemin.startsWith(CHEMIN_LISTE)) continue;
      const [, requete = ''] = page.chemin.split('?');
      expect(canonique(requete), page.chemin).toBe(page.chemin);
    }
  });

  it('aucune URL de facette n’entre dans le sitemap', () => {
    // Les pages de facettes dédiées sont hors périmètre du ticket (« surface produit non
    // spécifiée ») : elles sont canoniques d'elles-mêmes quand on y arrive, et personne ne les
    // annonce.
    expect(PAGES_STATIQUES_INDEXABLES.map((p) => p.chemin)).toContain(CHEMIN_LISTE);
    expect(PAGES_STATIQUES_INDEXABLES.filter((p) => p.chemin.includes('?'))).toEqual([]);
  });
});

/**
 * TCK-598 · AC11 (V14, contrainte 12) — **le quartier devient la QUATRIÈME facette canonique, et
 * il est borné deux fois** : par la ville présente dans l'URL (un quartier se juge dans SA ville),
 * et par le seuil `SEUIL_QUARTIER_INDEXABLE` — déjà appliqué au domaine que `quartiersDeLaVille`
 * rend, et éprouvé là (`queries/__tests__/facettes.test.ts`).
 */
describe('TCK-598 · AC11 — le quartier, borné par sa ville et par son domaine', () => {
  /** Le domaine des quartiers INDEXABLES de Dakar : « Mermoz » a passé le seuil, « Ouakam » non. */
  const AVEC_QUARTIERS: DomainesDeFacette = { ...DOMAINES, quartiers: new Map([['mermoz', 'Mermoz']]) };

  it('un quartier du domaine est canonique avec sa ville, dans l’ordre de la règle', () => {
    expect(canonique('location=Mermoz&city=Dakar', AVEC_QUARTIERS)).toBe(
      '/properties?city=Dakar&location=Mermoz',
    );
    expect(canonique('city=Dakar&location=Mermoz&type=villa&page=2', AVEC_QUARTIERS)).toBe(
      '/properties?type=villa&city=Dakar&location=Mermoz',
    );
  });

  it('la casse du quartier se replie sur celle du catalogue', () => {
    expect(canonique('city=dakar&location=MERMOZ', AVEC_QUARTIERS)).toBe(
      '/properties?city=Dakar&location=Mermoz',
    );
  });

  it('`?city=Dakar&location=Inventé` → `?city=Dakar` : un quartier inventé se replie sur la ville', () => {
    expect(canonique('city=Dakar&location=Invent%C3%A9', AVEC_QUARTIERS)).toBe('/properties?city=Dakar');
  });

  it('un quartier SOUS le seuil (absent du domaine) se replie sur la ville', () => {
    expect(canonique('city=Dakar&location=Ouakam', AVEC_QUARTIERS)).toBe('/properties?city=Dakar');
  });

  it('sans ville retenue, un quartier ne désigne rien — même s’il est dans le domaine', () => {
    expect(canonique('location=Mermoz', AVEC_QUARTIERS)).toBe(CHEMIN_LISTE);
    expect(canonique('city=Zzzinventee&location=Mermoz', AVEC_QUARTIERS)).toBe(CHEMIN_LISTE);
  });

  it('un domaine de quartiers inconnaissable (`null`) ou absent replie le quartier', () => {
    expect(canonique('city=Dakar&location=Mermoz', { ...DOMAINES, quartiers: null })).toBe(
      '/properties?city=Dakar',
    );
    expect(canonique('city=Dakar&location=Mermoz', DOMAINES)).toBe('/properties?city=Dakar');
  });

  it('un `&` dans un quartier est encodé, jamais une seconde clé', () => {
    const domaines: DomainesDeFacette = { ...DOMAINES, quartiers: new Map([['a&b', 'A&B']]) };
    expect(canonique('city=Dakar&location=A%26B', domaines)).toBe('/properties?city=Dakar&location=A%26B');
  });
});
